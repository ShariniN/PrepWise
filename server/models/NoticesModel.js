import mongoose from "mongoose";

const noticeSchema = new mongoose.Schema(
   {
    noticeId: {
      type: String,
      required: true,
      unique: true,
      default: () => `NTC-${Date.now()}` // generates unique ID
    },
    eventName: {
      type: String,
      required: true,
      trim: true,
    },
    eventDescription: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    time: {
      type: String, // e.g., "7:30 PM"
      required: true,
    },
    venue: {
      type: String,
      required: true,
    },
    registrationLink: {
      type: String,
      validate: {
        validator: function (v) {
          return /^https?:\/\/.+/.test(v);
        },
        message: (props) => `${props.value} is not a valid URL!`,
      },
    },
    otherInfo: {
      type: String,
      default: "",
    },
  },
  { timestamps: true } // adds createdAt and updatedAt automatically
);

// Prevent OverwriteModelError in dev (hot reloads)
const Notice = mongoose.models.Notice || mongoose.model("Notice", noticeSchema);

export default Notice;
