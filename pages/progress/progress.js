// pages/progress/progress.js
const app = getApp();
Page({
  data: {
    markers: [],
    // 训练小结数据
    totalTrainingDays: '-', // 锻炼总天数
    aiEvaluation: '-',      // AI动作评估
    qualityOfLife: '-',     // 生活质量
    
    userId: null, // 用户ID，从缓存读取
    backendBaseUrl: app.globalData.backendBaseUrl,
    showFollowUpRedDot: wx.getStorageSync('is_follow_up_week')
  },

  onLoad: function () {
    const userId = wx.getStorageSync('user_id');
    if (userId) {
      this.setData({ userId: userId });
      this.fetchProgressData(userId);
    } else {
      wx.showToast({
        title: '用户未登录，无法获取数据',
        icon: 'none',
        duration: 2000
      });
      wx.redirectTo({ // 使用 redirectTo 清除当前页面栈
        url: '/pages/login/login'
      });
    }
  },

  // 获取所有进度相关数据
  fetchProgressData: function(userId) {
    wx.request({
      url: `${this.data.backendBaseUrl}/users/${userId}/progress_summary`,
      method: 'GET',
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          const data = res.data;
          this.setData({
            markers: data.markers || [],
            totalTrainingDays: data.totalTrainingDays || '-',
            aiEvaluation: data.aiEvaluation !== '-' ? data.aiEvaluation : '-',
            qualityOfLife: data.qualityOfLife !== '-' ? data.qualityOfLife : '-'
          });
        } else {
          console.error('获取健康记录数据失败:', res);
          wx.showToast({ title: '获取数据失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('健康记录请求失败:', err);
        wx.showToast({ title: '网络错误，无法获取数据', icon: 'none' });
      }
    });
  },

  onReady() {
    // 可以在这里动态计算导航栏高度以适配所有机型
    // 但为简化，本示例使用固定高度和flex布局
  },

  handleHome: function() {
    wx.redirectTo({
      url: '/pages/home/home' // 假设记录页面的路径
    });
  },

  handleStartTraining: function() {
    wx.redirectTo({
      url: '/pages/exercise/exercise' // 假设训练页面的路径
    });
  },

  handleConsult: function() {
    wx.redirectTo({
      url: '/pages/chat/chat' // 假设记录页面的路径
    });
  }
});