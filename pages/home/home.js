// home.js
const app = getApp();
Page({
  data: {
    username: '用户',
    training_days: 0, 
    progress_percentage: 0,
    userId: null,
    backendBaseUrl: app.globalData.backendBaseUrl,
    showFollowUpRedDot: wx.getStorageSync('is_follow_up_week')
  },

  onLoad: function (options) {
    const userId = wx.getStorageSync('user_id');
    
    if (userId) {
      this.setData({
        userId: userId
      });
      this.fetchUserData(userId);
      this.fetchUserProgress(userId); // 修改：调用新的进度计算函数
    } else {
      wx.showToast({
        title: '未找到用户ID，请重新登录',
        icon: 'none',
        duration: 2000
      });
      wx.redirectTo({ // 使用 redirectTo 清除当前页面栈
        url: '/pages/login/login'
      });
      return;
    }
  },

  fetchUserData: function(userId) {
    wx.request({
      url: `${this.data.backendBaseUrl}/users/${userId}`,
      method: 'GET',
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          this.setData({
            username: res.data.name || '用户'
          });
        }
      },
      fail: (err) => {
        console.error('获取用户信息失败:', err);
      }
    });
  },

  // 新增：获取用户康复进度的函数
  fetchUserProgress: function(userId) {
    wx.request({
      url: `${this.data.backendBaseUrl}/api/users/${userId}/progress`,
      method: 'GET',
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          this.setData({
            training_days: res.data.training_days,
            progress_percentage: res.data.progress_percentage
          });
        } else {
          console.error('获取用户进度失败:', res);
          this.setData({
            training_days: 0,
            progress_percentage: 0
          });
        }
      },
      fail: (err) => {
        console.error('网络错误，无法获取用户进度:', err);
        this.setData({
          training_days: 0,
          progress_percentage: 0
        });
      }
    });
  },

  // Event handlers for navigation
  handleStartTraining: function() {
    wx.redirectTo({
      url: '/pages/exercise/exercise'
    });
  },

  handleViewRecords: function() {
    wx.redirectTo({
      url: '/pages/progress/progress'
    });
  },

  handleConsult: function() {
    wx.redirectTo({
      url: '/pages/chat/chat'
    });
  }
});