// home.js
Page({
  data: {
    // Default values, will be updated from API
    username: '用户', // Default username
    weeklyCompletedSessions: 0, // Number of sessions completed this week
    weeklyProgressPercentage: 0, // Weekly recovery plan progress (sessions completed / 5)
    userId: null // Will be read from cache
  },

  onLoad: function (options) {
    // Read userId from local storage/cache
    const userId = wx.getStorageSync('user_id');
    
    if (userId) {
      this.setData({
        userId: userId // Update data with the retrieved userId
      });
      // Fetch user info and calculate weekly progress when the page loads
      this.fetchUserData(userId);
      this.calculateWeeklyProgress(userId);
      // calculateTotalProgress is removed as per requirements
    } else {
      wx.showToast({
        title: '未找到用户ID，请重新登录',
        icon: 'none',
        duration: 2000
      });
      // Optionally navigate back to login page if userId is not found
      // wx.redirectTo({
      //   url: '/pages/login/login'
      // });
    }
  },

  // Fetches user's name from the database
  fetchUserData: function(userId) {
    wx.request({
      url: `http://localhost:8000/users/${userId}`, // Endpoint to get user by ID
      method: 'GET',
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          this.setData({
            username: res.data.name || '用户' // Update username
          });
        } else {
          console.error('Failed to fetch user data:', res);
          wx.showToast({
            title: '获取用户信息失败',
            icon: 'none',
            duration: 1500
          });
        }
      },
      fail: (err) => {
        console.error('Request failed:', err);
        wx.showToast({
          title: '网络错误，无法获取用户信息',
          icon: 'none',
          duration: 1500
        });
      }
    });
  },

  // Calculates completed sessions for the current week and weekly progress percentage
  calculateWeeklyProgress: function(userId) {
    // Get current date and calculate the start of the week (Monday)
    const today = new Date();
    const dayOfWeek = today.getDay(); // Sunday - 0, Monday - 1, etc.
    // Adjust to Monday: If today is Sunday (0), go back 6 days. Otherwise, go back dayOfWeek - 1 days.
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(today.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0); // Set to start of the day

    wx.request({
      url: `http://localhost:8000/recovery_records/search`, // Endpoint to search recovery records
      method: 'GET',
      data: {
        field: 'user_id',
        value: userId // Filter by user ID
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          const weeklyRecords = res.data.filter(record => {
            // Assuming record_date is in 'YYYY-MM-DD HH:MM:SS' format
            const recordDate = new Date(record.record_date.split(' ')[0]); 
            return recordDate >= startOfWeek;
          });
          const sessions = weeklyRecords.length;
          // Calculate weekly progress: sessions completed / 5, then multiply by 100 for percentage
          const progress = Math.min((sessions / 5) * 100, 100); // Cap at 100%

          this.setData({
            weeklyCompletedSessions: sessions,
            weeklyProgressPercentage: progress
          });
        } else if (res.statusCode === 404) {
          this.setData({
            weeklyCompletedSessions: 0,
            weeklyProgressPercentage: 0
          }); // No records found for the user
        } else {
          console.error('Failed to fetch weekly records:', res);
          this.setData({
            weeklyCompletedSessions: 0,
            weeklyProgressPercentage: 0
          });
        }
      },
      fail: (err) => {
        console.error('Request failed:', err);
        this.setData({
          weeklyCompletedSessions: 0,
          weeklyProgressPercentage: 0
        });
      }
    });
  },

  // Event handlers for navigation
  handleStartTraining: function() {
    wx.navigateTo({
      url: '/pages/exercise/exercise' // Assumed training page path
    });
  },

  handleShowVideo: function() {
    wx.navigateTo({
      url: '/pages/video/video' // Assumed video page path
    });
  },

  handleViewRecords: function() {
    wx.navigateTo({
      url: '/pages/progress/progress' // Assumed records page path
    });
  },

  handleConsult: function() {
    wx.navigateTo({
      url: '/pages/chat/chat' // Assumed chat page path
    });
  }
});