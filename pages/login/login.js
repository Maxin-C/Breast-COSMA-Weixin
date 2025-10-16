const app = getApp();
Page({
  /**
   * Page initial data
   */
  data: {
    username: '',
    backendBaseUrl: app.globalData.backendBaseUrl,
    templateId: app.globalData.templateId[0],
    showSubscribeModal: false
  },

  /**
   * Event handler for username input
   */
  handleUsernameInput: function (e) {
    this.setData({
      username: e.detail.value
    });
  },

  /**
   * Event handler for the "Log in" button
   */
  handleLogin: function () {
    const { username } = this.data;

    if (!username) {
      wx.showToast({
        title: '请输入你的姓名',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    wx.showLoading({ title: '登录中...' });
    
    wx.request({
      url: `${this.data.backendBaseUrl}/users/search`,
      method: 'GET', 
      data: {
        field: 'name', 
        value: username 
      },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data.length > 0) { 
          const user = res.data[0]; 
          const userId = user.user_id;

          wx.setStorageSync('user_id', userId);
          wx.showToast({ title: '登录成功！', icon: 'success' });

          // --- 核心改动：调用新的检查函数 ---
          this.checkSubscriptionAndProceed(userId, user);

        } else { 
             wx.showToast({
                title: '登录失败，请检查姓名或注册账户',
                icon: 'none',
                duration: 2000
             });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('Login request failed:', err);
        wx.showToast({
          title: '网络错误，请重新尝试。',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  /**
   * 新增：检查订阅状态并决定下一步操作
   * @param {number} userId - The user's ID.
   * @param {object} user - The full user object from the backend.
   */
  checkSubscriptionAndProceed: function(userId, user) {
    wx.request({
        url: `${this.data.backendBaseUrl}/api/check_subscription_status`,
        method: 'GET',
        data: {
            user_id: userId,
            template_id: this.data.templateId
        },
        success: (res) => {
            if (res.statusCode === 200 && res.data.isSubscribed) {
                // 已订阅，直接跳转
                console.log('用户已订阅明日提醒，直接跳转。');
                this.findPlanAndNavigate(userId);
            } else {
                // 未订阅，继续检查 openid 并准备显示弹窗
                console.log('用户未订阅，检查openid。');
                if (!user.wechat_openid) {
                    console.log('用户缺少 openid，开始更新...');
                    this.updateUserOpenId(userId);
                } else {
                    console.log('用户 openid 已存在，显示订阅弹窗');
                    this.setData({ showSubscribeModal: true });
                }
            }
        },
        fail: (err) => {
            // 如果检查失败，为保险起见，默认执行显示弹窗的流程
            console.error('检查订阅状态失败，默认显示弹窗:', err);
            if (!user.wechat_openid) {
                this.updateUserOpenId(userId);
            } else {
                this.setData({ showSubscribeModal: true });
            }
        }
    });
  },

  /**
   * 获取 code 并请求后端更新 openid 的函数
   * @param {number} userId - The ID of the user to update.
   */
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
              if (updateRes.statusCode === 200) {
                console.log('后端更新 openid 成功');
                this.setData({ showSubscribeModal: true });
              } else {
                wx.showToast({ title: '同步用户信息失败', icon: 'none' });
              }
            },
            fail: () => {
              wx.showToast({ title: '网络请求失败', icon: 'none' });
            },
            complete: () => {
              wx.hideLoading();
            }
          });
        } else {
          wx.hideLoading();
          wx.showToast({ title: '获取登录凭证失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '微信登录失败', icon: 'none' });
      }
    });
  },

  onConfirmSubscribe() {
    const tmplId = this.data.templateId;
    const userId = wx.getStorageSync('user_id');

    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success: (res) => {
        if (res[tmplId] === 'accept') {
          this.callBackendToSchedule(userId, tmplId);
        }
      },
      complete: () => {
        this.setData({ showSubscribeModal: false });
        this.findPlanAndNavigate(userId);
      }
    });
  },

  onCancelSubscribe() {
    const userId = wx.getStorageSync('user_id');
    this.setData({ showSubscribeModal: false });
    this.findPlanAndNavigate(userId);
  },

  callBackendToSchedule(userId, templateId) {
    wx.request({
      url: `${this.data.backendBaseUrl}/api/schedule_notification`,
      method: 'POST',
      data: { user_id: userId, template_id: templateId },
      success: (apiRes) => {
        console.log('后端订阅成功', apiRes.data);
        wx.showToast({ title: '订阅成功！' });
      },
      fail: (apiErr) => {
        console.error('后端订阅失败', apiErr);
      }
    });
  },

  findPlanAndNavigate: function(userId) {
    setTimeout(() => {
        wx.request({
            url: `${this.data.backendBaseUrl}/user_recovery_plans/search`,
            method: 'GET',
            data: { field: 'user_id', value: userId },
            success: (planRes) => {
                if (planRes.statusCode === 200 && planRes.data.length > 0) {
                  wx.setStorageSync('user_plan_id', planRes.data[0].user_plan_id);
                }
            },
            complete: () => {
                wx.navigateTo({ url: '/pages/home/home' });
            }
        });
    }, 500);
  },

  handleSignUp: function () {
    wx.navigateTo({
      url: '/pages/signup/signup'
    });
  },

  onLoad: function (options) {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {}
});

