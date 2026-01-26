
//controllers/noticesController.js
import Notice from "../models/NoticesModel.js";

// Add a new notice
export const addNotice = async (req, res) => {
  try {
    const { eventName, eventDescription, date, time, venue, registrationLink, otherInfo } = req.body;
    
    const newNotice = new Notice({ 
      eventName, 
      eventDescription, 
      date, 
      time, 
      venue, 
      registrationLink, 
      otherInfo 
    });
    
    await newNotice.save();
    res.status(201).json({ message: 'Notice added successfully', notice: newNotice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all notices
export const getNotices = async (req, res) => {
  try {
    const notices = await Notice.find().sort({ date: -1, createdAt: -1 });
    res.status(200).json(notices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get notices by date range (optional - for filtering upcoming events)
export const getNoticesByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = {};
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else if (startDate) {
      query.date = { $gte: new Date(startDate) };
    }
    
    const notices = await Notice.find(query).sort({ date: 1 });
    res.status(200).json(notices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get upcoming notices/events (events with date >= today)
export const getUpcomingNotices = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    const upcomingNotices = await Notice.find({
      date: { $gte: today }
    }).sort({ date: 1 });
    
    res.status(200).json(upcomingNotices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get a single notice by ID
export const getNoticeById = async (req, res) => {
  try {
    const { id } = req.params;
    const notice = await Notice.findById(id);
    
    if (!notice) {
      return res.status(404).json({ message: 'Notice not found' });
    }
    
    res.status(200).json(notice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update a notice
export const updateNotice = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const updatedNotice = await Notice.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    if (!updatedNotice) {
      return res.status(404).json({ message: 'Notice not found' });
    }
    
    res.status(200).json({ message: 'Notice updated successfully', notice: updatedNotice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete a notice
export const deleteNotice = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedNotice = await Notice.findByIdAndDelete(id);
    
    if (!deletedNotice) {
      return res.status(404).json({ message: 'Notice not found' });
    }
    
    res.status(200).json({ message: 'Notice deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all events (notices) - This is the main function for fetching events
export const getEvents = async (req, res) => {
  try {
    console.log('getEvents function called');
    const events = await Notice.find().sort({ createdAt: -1 });
    console.log('Events found:', events.length);
    res.status(200).json(events);
  } catch (err) {
    console.error('Error in getEvents:', err);
    res.status(500).json({ error: err.message });
  }
};