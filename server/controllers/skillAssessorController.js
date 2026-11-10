import SkillsAssessment from '../models/SkillsAssessment.js';
import crypto from 'crypto';

// Helper function to calculate summary statistics
const calculateSummary = (skills) => {
  if (!skills || skills.length === 0) {
    return {
      totalTechnologies: 0,
      averageConfidence: 0,
      expertCount: 0,
      proficientCount: 0,
      learningCount: 0
    };
  }

  const total = skills.length;
  // Handle both confidenceLevel and proficiencyLevel fields
  const avgConfidence = skills.reduce((sum, skill) => {
    const level = skill.proficiencyLevel || skill.confidenceLevel || 0;
    return sum + level;
  }, 0) / total;
  
  const expertCount = skills.filter(skill => {
    const level = skill.proficiencyLevel || skill.confidenceLevel || 0;
    return level >= 8;
  }).length;
  
  const proficientCount = skills.filter(skill => {
    const level = skill.proficiencyLevel || skill.confidenceLevel || 0;
    return level >= 6 && level < 8;
  }).length;
  
  const learningCount = skills.filter(skill => {
    const level = skill.proficiencyLevel || skill.confidenceLevel || 0;
    return level < 6;
  }).length;

  return {
    totalTechnologies: total,
    averageConfidence: Math.round(avgConfidence * 10) / 10,
    expertCount,
    proficientCount,
    learningCount
  };
};

// GET /api/swot/ratings - Get all ratings for the authenticated user - INTEGRATED VERSION
export const getRatings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { resumeHash } = req.params; // Optional - if getting ratings for specific resume

    console.log('🧠 Fetching skills assessments for user:', userId);
    if (resumeHash) {
      console.log('🧠 Filtering by resumeHash:', resumeHash);
    }

    // Build query
    let query = { userId };
    if (resumeHash) {
      query.resumeHash = resumeHash;
    }

    // Query assessments using the static method from your model
    const assessments = await SkillsAssessment.find(query)
      .sort({ updatedAt: -1 })
      .limit(50)
      .populate('userId', 'name email') // Optionally populate user data
      .lean(); // Use lean() for better performance

    console.log(`🧠 Found ${assessments.length} skills assessments`);

    if (assessments.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No skills assessments found',
        data: []
      });
    }

    // Transform the data to ensure compatibility with frontend
    const transformedAssessments = assessments.map(assessment => {
      console.log(`🧠 Processing assessment ID: ${assessment._id}, Skills: ${assessment.skills?.length || 0}`);

      // Ensure skills array exists
      const skills = assessment.skills || [];

      // Calculate proficiency distribution
      const expertCount = skills.filter(s => s.proficiencyLevel >= 8).length;
      const proficientCount = skills.filter(s => s.proficiencyLevel >= 6 && s.proficiencyLevel < 8).length;
      const learningCount = skills.filter(s => s.proficiencyLevel < 6).length;

      // Calculate average proficiency
      const avgProficiency = skills.length > 0 
        ? skills.reduce((sum, skill) => sum + skill.proficiencyLevel, 0) / skills.length
        : 0;

      // Calculate overall score
      const overallScore = assessment.overallScore || Math.round(avgProficiency * 10);

      // Determine skill level
      let level = 'Beginner';
      if (avgProficiency >= 8) level = 'Expert';
      else if (avgProficiency >= 6) level = 'Advanced';
      else if (avgProficiency >= 4) level = 'Intermediate';

      // Get top skills sorted by proficiency
      const topSkills = skills
        .sort((a, b) => b.proficiencyLevel - a.proficiencyLevel)
        .slice(0, 10)
        .map(skill => ({
          name: skill.name,
          category: skill.category || 'General',
          proficiencyLevel: skill.proficiencyLevel,
          confidence: skill.proficiencyLevel, // Alias for frontend
          yearsOfExperience: skill.yearsOfExperience || 0,
          isCoreTechnology: skill.isCoreTechnology || false
        }));

      return {
        _id: assessment._id, // Keep MongoDB _id
        userId: assessment.userId,
        assessmentType: assessment.assessmentType || 'SWOT Analysis',
        resumeHash: assessment.resumeHash,
        
        // SWOT data
        strengths: assessment.strengths || [],
        weaknesses: assessment.weaknesses || [],
        opportunities: assessment.opportunities || [],
        threats: assessment.threats || [],
        
        // Skills data
        skills: skills, // Full skills array
        topTechnologies: topSkills, // Alias for frontend
        
        // Calculated metrics
        overallScore: overallScore,
        averageProficiency: Math.round(avgProficiency * 10) / 10,
        totalTechnologies: skills.length,
        expertCount: expertCount,
        proficientCount: proficientCount,
        learningCount: learningCount,
        level: level,
        
        // Recommendations
        recommendations: assessment.recommendations || [],
        careerSuggestions: assessment.careerSuggestions || [],
        improvementAreas: assessment.improvementAreas || [],
        
        // Timestamps
        isSaved: assessment.isSaved,
        completedAt: assessment.completedAt,
        createdAt: assessment.createdAt,
        updatedAt: assessment.updatedAt,
        
        // Virtual fields for frontend
        isRecent: assessment.isRecent,
        skillCategories: [...new Set(skills.map(s => s.category || 'General'))]
      };
    });

    console.log(`🧠 Transformed ${transformedAssessments.length} assessments successfully`);

    res.status(200).json({
      success: true,
      message: `Found ${assessments.length} skills assessments`,
      data: transformedAssessments,
      count: transformedAssessments.length
    });

  } catch (error) {
    console.error('❌ Error fetching skills assessments:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch skills assessments',
      error: error.message
    });
  }
};

// POST /api/swot/save-ratings - Enhanced save with support for both models
export const saveRatings = async (req, res) => {
  try {
    console.log('🔍 Saving technology ratings...');
    
    const { resumeHash, technologies, shouldSave = true } = req.body;
    const userId = req.user.id;

    console.log(`=== Saving Technology Ratings ===`);
    console.log(`User: ${userId}`);
    console.log(`Resume Hash: ${resumeHash}`);
    console.log(`Technologies count: ${technologies?.length || 0}`);
    console.log(`Should save: ${shouldSave}`);

    // Validation
    if (!resumeHash || typeof resumeHash !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Valid resume hash is required',
        required: ['resumeHash']
      });
    }

    if (!technologies || !Array.isArray(technologies) || technologies.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one technology rating is required',
        required: ['technologies'],
        format: 'Array of {name, category, confidenceLevel/proficiencyLevel}'
      });
    }

    // Validate and clean technology data
    const validatedSkills = [];
    const errors = [];

    for (let i = 0; i < technologies.length; i++) {
      const tech = technologies[i];
      
      if (!tech.name || typeof tech.name !== 'string') {
        errors.push(`Technology ${i + 1}: name is required and must be a string`);
        continue;
      }

      const proficiencyLevel = tech.confidenceLevel || tech.proficiencyLevel;
      if (!proficiencyLevel || typeof proficiencyLevel !== 'number') {
        errors.push(`Technology ${i + 1}: confidenceLevel/proficiencyLevel is required and must be a number`);
        continue;
      }

      if (proficiencyLevel < 1 || proficiencyLevel > 10) {
        errors.push(`Technology ${i + 1}: confidenceLevel/proficiencyLevel must be between 1 and 10`);
        continue;
      }

      // Create skill object with both field names for compatibility
      const skill = {
        name: tech.name.trim(),
        category: tech.category ? tech.category.trim() : 'General',
        confidenceLevel: Math.round(proficiencyLevel * 10) / 10,
        proficiencyLevel: Math.round(proficiencyLevel * 10) / 10,
        yearsOfExperience: tech.yearsOfExperience || 0,
        lastUsed: new Date(),
        isCoreTechnology: tech.isCore || false
      };

      validatedSkills.push(skill);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Technology validation failed',
        errors: errors
      });
    }

    const calculatedSummary = calculateSummary(validatedSkills);

    // Any database failure is a 500 (a missing or vanished document included).
    const existingAssessment = await SkillsAssessment.findOne({ userId, resumeHash });
    const assessmentData = {
      userId,
      institutionId: req.user.institutionId,
      resumeHash,
      assessmentType: 'Technical Skills',
      skills: validatedSkills,
      overallScore: Math.round(calculatedSummary.averageConfidence * 10),
      isSaved: shouldSave,
      completedAt: new Date()
    };
    const savedAssessment = existingAssessment
      ? await SkillsAssessment.findByIdAndUpdate(existingAssessment._id, assessmentData, { new: true, runValidators: true })
      : await SkillsAssessment.create(assessmentData);

    res.json({
      success: true,
      message: shouldSave
        ? `Skills assessment saved successfully`
        : `Skills assessment draft updated successfully`,
      data: {
        id: savedAssessment._id,
        resumeHash: savedAssessment.resumeHash,
        saved: savedAssessment.isSaved,
        technologiesCount: savedAssessment.skills?.length,
        summary: calculatedSummary,
        createdAt: savedAssessment.createdAt,
        updatedAt: savedAssessment.updatedAt
      },
      stats: {
        totalTechnologies: calculatedSummary.totalTechnologies,
        averageConfidence: calculatedSummary.averageConfidence,
        distribution: {
          expert: calculatedSummary.expertCount,
          proficient: calculatedSummary.proficientCount,
          learning: calculatedSummary.learningCount
        },
        usingEnhancedModel: true
      }
    });

  } catch (error) {
    console.error('❌ Error saving technology ratings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save technology ratings',
      error: error.message
    });
  }
};

// DELETE /api/swot/delete/:id - Enhanced delete supporting both models - INTEGRATED VERSION
export const deleteRatings = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log(`🗑️ Deleting assessment: ${id} for user: ${userId}`);

    console.log(`=== Deleting Skills Assessment ===`);
    console.log(`User: ${userId}`);
    console.log(`Assessment ID: ${id}`);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Assessment ID is required for deletion'
      });
    }

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assessment ID format',
        received: id
      });
    }

    const assessment = await SkillsAssessment.findOneAndDelete({
      _id: id,
      userId: userId // Ensure user owns this assessment
    });

    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: 'Assessment not found or you do not have permission to delete it'
      });
    }

    console.log(`✅ Successfully deleted assessment: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Assessment deleted successfully',
      deletedId: id,
      deletedAssessment: {
        id: assessment._id,
        resumeHash: assessment.resumeHash,
        skillsCount: (assessment.skills?.length || 0),
        wasSaved: assessment.isSaved,
        deletedAt: new Date().toISOString(),
        usingEnhancedModel: true
      }
    });

  } catch (error) {
    console.error('❌ Error deleting assessment:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to delete assessment',
      error: error.message
    });
  }
};
