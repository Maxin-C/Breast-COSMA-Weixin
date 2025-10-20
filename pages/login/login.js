const app = getApp();
Page({
  data: {
    username: '',
    backendBaseUrl: app.globalData.backendBaseUrl,
    templateId: app.globalData.templateId[0],
    currentUser: null,
    showStatusModal: false,
    extubationStatus: '未拔管',
    reminderTime: '08:00',
  },

  onLoad: function (options) {
    const savedTime = wx.getStorageSync('reminderTime');
    if (savedTime) {
      this.setData({ reminderTime: savedTime });
    }
  },

  handleUsernameInput: function (e) { this.setData({ username: e.detail.value }); },
  onExtubationChange: function(e) { this.setData({ extubationStatus: e.detail.value }); },
  onTimeChange: function(e) {
    this.setData({ reminderTime: e.detail.value });
    wx.setStorageSync('reminderTime', e.detail.value);
  },

  handleLogin: function () {
    const { username } = this.data;
    if (!username) {
      wx.showToast({ title: '请输入你的姓名', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '登录中...' });
    
    wx.request({
      url: `${this.data.backendBaseUrl}/users/search`,
      method: 'GET', 
      data: { field: 'name', value: username },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data.length > 0) { 
          const user = res.data[0]; 
          wx.setStorageSync('user_id', user.user_id);
          // wx.showToast({ title: '登录成功！', icon: 'success' });
          this.setData({ currentUser: user });

          if (user.extubation_status !== '已拔管') {
            this.setData({ showStatusModal: true });
          } else {
            this.updateUserPlanAndProceed();
          }
        } else { 
             wx.showToast({ title: '登录失败，请检查姓名或注册账户', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误，请重新尝试。', icon: 'none' });
      }
    });
  },
  
  onConfirmStatusUpdate() {
    this.setData({ showStatusModal: false });
    wx.showLoading({ title: '正在更新状态...' });

    wx.request({
      url: `${this.data.backendBaseUrl}/users/${this.data.currentUser.user_id}`,
      method: 'PUT',
      data: { extubation_status: this.data.extubationStatus },
      success: (res) => {
        if (res.statusCode === 200) {
          console.log('拔管状态更新成功:', this.data.extubationStatus);
          // 在触发计划更新前，更新本地 currentUser 对象的状态，以确保后续逻辑正确
          this.setData({
            'currentUser.extubation_status': this.data.extubationStatus
          });
          this.updateUserPlanAndProceed();
        } else {
          wx.hideLoading();
          wx.showToast({ title: '状态更新失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络请求失败', icon: 'none' });
      }
    });
  },
  
  updateUserPlanAndProceed() {
    const userId = wx.getStorageSync('user_id');
    if (!userId) return;
    wx.showLoading({ title: '正在更新康复计划...' });

    wx.request({
      url: `${this.data.backendBaseUrl}/users/login_logic`,
      method: 'POST',
      data: { user_id: userId },
      success: (res) => {
        if (res.statusCode === 200) {
          console.log('康复计划更新成功:', res.data);
          if (res.data.user_plan_id) {
            wx.setStorageSync('user_plan_id', res.data.user_plan_id);
          }
        } else {
          console.error('康复计划更新失败:', res.data.error);
        }
      },
      fail: (err) => {
        console.error('更新康复计划的网络请求失败:', err);
      },
      complete: () => {
        wx.hideLoading();
        // **【核心修改】** 计划更新后，检查随访状态
        this.checkFollowupAndNavigate();
      }
    });
  },

  // --- 新增：检查随访状态并决定最终跳转 ---
  checkFollowupAndNavigate() {
    const userId = wx.getStorageSync('user_id');
    wx.request({
      url: `${this.data.backendBaseUrl}/users/check_followup_status`,
      method: 'GET',
      data: { user_id: userId },
      success: (res) => {
        if (res.statusCode === 200) {
          const { is_followup_week, has_completed_followup } = res.data;
          
          if (is_followup_week && !has_completed_followup) {
            wx.setStorageSync("is_follow_up_week", true)
            // 是随访周且未完成 -> 跳转到 chat 页面并带上提示标记
            wx.redirectTo({
              url: `/pages/chat/chat?showFollowupPrompt=true`
            });
          } else {
            // 其他情况 -> 正常跳转到 home 页面
            wx.setStorageSync("is_follow_up_week", false)
            this.handleAutoSubscriptionAndProceed(userId, this.data.currentUser);
          }
        } else {
          // 如果接口失败，默认走正常流程
          wx.setStorageSync("is_follow_up_week", false)
          this.handleAutoSubscriptionAndProceed(userId, this.data.currentUser);
        }
      },
      fail: () => {
        // 如果网络失败，默认走正常流程
        this.handleAutoSubscriptionAndProceed(userId, this.data.currentUser);
      }
    });
  },

  handleAutoSubscriptionAndProceed: function(userId, user) {
    if (!user.wechat_openid) {
      this.updateUserOpenId(userId);
      return;
    }
    
    const tmplId = this.data.templateId;
    
    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success: (res) => {
        if (res[tmplId] === 'accept') {
          this.callBackendToSchedule(userId, tmplId);
        }
      },
      complete: () => {
        this.redirectToHome();
      }
    });
  },

  updateUserOpenId: function (userId) {
    wx.showLoading({ title: '正在同步信息...' });
    wx.login({
      success: (res) => {
        if (res.code) {
          wx.request({
            url: `${this.data.backendBaseUrl}/users/update_openid`,
            method: 'POST',
            data: { user_id: userId, code: res.code },
            success: (updateRes) => {
              wx.hideLoading();
              if (updateRes.statusCode === 200) {
                console.log('后端更新 openid 成功');
                this.handleAutoSubscriptionAndProceed(userId, this.data.currentUser);
              } else {
                this.redirectToHome(); 
              }
            },
            fail: () => {
              wx.hideLoading();
              this.redirectToHome();
            }
          });
        } else {
          wx.hideLoading();
          this.redirectToHome();
        }
      },
      fail: () => {
        wx.hideLoading();
        this.redirectToHome();
      }
    });
  },
  
  callBackendToSchedule(userId, templateId) {
    wx.request({
      url: `${this.data.backendBaseUrl}/schedule_notification`,
      method: 'POST',
      data: { 
        user_id: userId, 
        template_id: templateId,
        scheduled_time: this.data.reminderTime 
      },
      success: (apiRes) => { console.log('后端订阅处理结果:', apiRes.data.message); },
      fail: (apiErr) => { console.error('后端订阅接口调用失败', apiErr); }
    });
  },

  redirectToHome: function() {
    setTimeout(() => {
        wx.redirectTo({ url: '/pages/home/home' });
    }, 500);
  },

  handleSignUp: function () {
    wx.redirectTo({ url: '/pages/signup/signup' });
  },
});