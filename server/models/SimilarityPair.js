import mongoose from 'mongoose';

const { Schema } = mongoose;

const rangeSchema = new Schema({ startLine: Number, endLine: Number }, { _id: false });

const similarityPairSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
  questionId: { type: Schema.Types.ObjectId, required: true },
  sessionAId: { type: Schema.Types.ObjectId, required: true },
  sessionBId: { type: Schema.Types.ObjectId, required: true },
  userAId: { type: Schema.Types.ObjectId, required: true },
  userBId: { type: Schema.Types.ObjectId, required: true },
  containment: { type: Number, required: true },   // shared fingerprints / fingerprints of the smaller submission
  jaccard: { type: Number, required: true },
  sharedFingerprints: { type: Number, required: true },
  flagged: { type: Boolean, default: false },
  threshold: { type: Number, required: true },
  rangesA: { type: [rangeSchema], default: [] },
  rangesB: { type: [rangeSchema], default: [] },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'similaritypairs' });

export default mongoose.models.SimilarityPair || mongoose.model('SimilarityPair', similarityPairSchema);
