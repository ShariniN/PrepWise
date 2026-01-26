import SkillsAssessment from '../models/SkillAssessorModel.js';
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
    
    const { resumeHash, technologies, summary, shouldSave = true } = req.body;
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

    // Calculate summary statistics
    const calculatedSummary = calculateSummary(validatedSkills);
    const finalSummary = summary ? { ...calculatedSummary, ...summary } : calculatedSummary;

    try {
      // Try enhanced model first
      let savedAssessment;
      let usingEnhancedModel = false;

      try {
        // Find existing assessment or create new one (enhanced model)
        let existingAssessment = await SkillsAssessment.findOne({
          userId: userId,
          resumeHash: resumeHash
        });

        const assessmentData = {
          userId: userId,
          resumeHash: resumeHash,
          assessmentType: 'Technical Skills',
          skills: validatedSkills,
          overallScore: Math.round(calculatedSummary.averageConfidence * 10),
          isSaved: shouldSave,
          completedAt: new Date()
        };

        if (existingAssessment) {
          console.log(`Updating existing skills assessment: ${existingAssessment._id}`);
          savedAssessment = await SkillsAssessment.findByIdAndUpdate(
            existingAssessment._id,
            assessmentData,
            { new: true, runValidators: true }
          );
        } else {
          console.log(`Creating new skills assessment`);
          savedAssessment = await SkillsAssessment.create(assessmentData);
        }

        usingEnhancedModel = true;
        console.log(`Successfully ${existingAssessment ? 'updated' : 'created'} skills assessment: ${savedAssessment._id}`);

      } catch (enhancedError) {
        console.log('Enhanced model not available, using fallback TechnologyRating model');
        
        // Fallback to original TechnologyRating model
        let rating = await TechnologyRating.findOne({
          userId: userId,
          resumeHash: resumeHash
        });

        if (rating) {
          // Update existing rating
          rating.technologies = validatedSkills;
          rating.summary = finalSummary;
          rating.saved = shouldSave;
          rating.updatedAt = new Date();
          await rating.save();
          savedAssessment = rating;
          console.log(`Updated existing technology rating: ${rating._id}`);
        } else {
          // Create new rating
          rating = new TechnologyRating({
            userId: userId,
            resumeHash,
            technologies: validatedSkills,
            summary: finalSummary,
            saved: shouldSave
          });
          await rating.save();
          savedAssessment = rating;
          console.log(`Created new technology rating: ${rating._id}`);
        }
      }

      // Prepare enhanced response
      const responseData = {
        success: true,
        message: shouldSave 
          ? `Skills assessment saved successfully`
          : `Skills assessment draft updated successfully`,
        data: {
          id: savedAssessment._id,
          resumeHash: savedAssessment.resumeHash,
          saved: usingEnhancedModel ? savedAssessment.isSaved : savedAssessment.saved,
          technologiesCount: usingEnhancedModel ? savedAssessment.skills?.length : savedAssessment.technologies?.length,
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
          usingEnhancedModel
        }
      };

      res.json(responseData);

    } catch (dbError) {
      console.error('Database error saving skills assessment:', dbError);
      
      if (dbError.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'Skills assessment for this resume already exists',
          error: 'DUPLICATE_ASSESSMENT'
        });
      }

      if (dbError.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Skills assessment validation failed',
          errors: Object.values(dbError.errors).map(err => err.message)
        });
      }

      throw dbError;
    }

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

// GET /api/swot/stats - Get user statistics - INTEGRATED VERSION
export const getRatingsStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await SkillsAssessment.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalAssessments: { $sum: 1 },
          savedAssessments: {
            $sum: { $cond: [{ $eq: ['$isSaved', true] }, 1, 0] }
          },
          averageScore: { $avg: '$overallScore' },
          totalSkills: { $sum: { $size: '$skills' } },
          latestAssessment: { $max: '$updatedAt' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: stats[0] || {
        totalAssessments: 0,
        savedAssessments: 0,
        averageScore: 0,
        totalSkills: 0,
        latestAssessment: null
      }
    });

  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
};

// GET /api/swot/ratings/:resumeHash or /api/swot/ratings/:id - Enhanced details supporting both patterns
export const getRatingDetails = async (req, res) => {
  try {
    const { resumeHash, id } = req.params;
    const userId = req.user.id;
    const identifier = id || resumeHash; // Support both patterns

    console.log(`=== Getting Assessment Details ===`);
    console.log(`User: ${userId}`);
    console.log(`Identifier: ${identifier}`);

    let assessment = null;
    let usingEnhancedModel = false;
    let searchByHash = false;

    // Determine if it's an ObjectId or resume hash
    if (identifier && identifier.match(/^[0-9a-fA-F]{24}$/)) {
      // It's an ObjectId - search by ID
      console.log('Searching by ID');
      
      try {
        // Try enhanced model first
        assessment = await SkillsAssessment.findOne({
          _id: identifier,
          userId: userId,
          assessmentType: 'Technical Skills'
        }).select('-userId');
        
        if (assessment) {
          usingEnhancedModel = true;
        }
      } catch (enhancedError) {
        console.log('Enhanced model not available, trying fallback');
      }

      if (!assessment) {
        // Fallback to TechnologyRating model
        assessment = await TechnologyRating.findOne({
          _id: identifier,
          userId: userId
        });
      }

    } else {
      // It's a resume hash - search by hash
      console.log('Searching by resume hash');
      searchByHash = true;

      try {
        // Try enhanced model first
        assessment = await SkillsAssessment.findOne({
          userId: userId,
          resumeHash: identifier,
          assessmentType: 'Technical Skills'
        }).select('-userId');
        
        if (assessment) {
          usingEnhancedModel = true;
        }
      } catch (enhancedError) {
        console.log('Enhanced model not available, trying fallback');
      }

      if (!assessment) {
        // Fallback to TechnologyRating model
        assessment = await TechnologyRating.findOne({
          userId: userId,
          resumeHash: identifier
        });
      }
    }

    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: searchByHash ? 'Rating not found for this resume' : 'Skills assessment not found',
        identifier: identifier
      });
    }

    let assessmentDetails = assessment.toObject();
    
    // Add detailed analysis for enhanced model
    if (usingEnhancedModel && assessment.skills) {
      assessmentDetails.analysis = {
        strengthAreas: assessment.skills.filter(s => s.proficiencyLevel >= 8),
        improvementAreas: assessment.skills.filter(s => s.proficiencyLevel < 6),
        balancedAreas: assessment.skills.filter(s => s.proficiencyLevel >= 6 && s.proficiencyLevel < 8),
        
        categoryBreakdown: assessment.skills.reduce((acc, skill) => {
          const category = skill.category || 'General';
          if (!acc[category]) {
            acc[category] = {
              count: 0,
              avgConfidence: 0,
              skills: []
            };
          }
          acc[category].count++;
          acc[category].skills.push(skill);
          return acc;
        }, {}),
        
        recommendations: []
      };

      // Calculate average confidence per category
      Object.keys(assessmentDetails.analysis.categoryBreakdown).forEach(category => {
        const categoryData = assessmentDetails.analysis.categoryBreakdown[category];
        categoryData.avgConfidence = Math.round(
          (categoryData.skills.reduce((sum, skill) => sum + skill.proficiencyLevel, 0) / categoryData.count) * 10
        ) / 10;
      });

      // Generate recommendations
      if (assessmentDetails.analysis.improvementAreas.length > 0) {
        assessmentDetails.analysis.recommendations.push(
          `Focus on improving ${assessmentDetails.analysis.improvementAreas.length} skills with proficiency below 6/10`
        );
      }
      
      if (assessmentDetails.analysis.strengthAreas.length > 0) {
        assessmentDetails.analysis.recommendations.push(
          `Leverage your expertise in ${assessmentDetails.analysis.strengthAreas.map(s => s.name).slice(0, 3).join(', ')}`
        );
      }
    }

    res.json({
      success: true,
      data: assessmentDetails,
      metadata: {
        usingEnhancedModel,
        searchByHash,
        identifier
      }
    });

  } catch (error) {
    console.error('❌ Error getting rating details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get rating details',
      error: error.message
    });
  }
};