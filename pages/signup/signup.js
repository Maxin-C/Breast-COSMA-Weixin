const app = getApp();
Page({
  /**
   * Page initial data
   */
  data: {
    name: '',
    serialNumber: '',
    isDrainageRemoved: null,
    backendBaseUrl: app.globalData.backendBaseUrl,
    templateId: app.globalData.templateId[0],
    showSubscribeModal: false
  },

  handleNameInput: function (e) {
    this.setData({
      name: e.detail.value
    });
  },

  handleSerialNumberInput: function (e) {
    this.setData({
      serialNumber: e.detail.value
    });
  },

  handleDrainageChange: function (e) {
    this.setData({
      isDrainageRemoved: e.detail.value === 'true'
    });
  },

  handleSignUp: function () {
    const { name, serialNumber, isDrainageRemoved } = this.data;

    if (!name || !serialNumber || isDrainageRemoved === null) {
      wx.showToast({
        title: '请填写所有必填项',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    if (!/^\d+$/.test(serialNumber)) {
      wx.showToast({
        title: '编号格式不正确',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    wx.showLoading({ title: '请稍候...' });

    wx.request({
      url: `${this.data.backendBaseUrl}/users/search`,
      method: 'GET',
      data: {
        field: 'srrsh_id',
        value: serialNumber
      },
      success: (searchRes) => {
        wx.hideLoading();
        if (searchRes.statusCode === 200 && searchRes.data.length > 0) {
          const existingUser = searchRes.data[0];
          if (existingUser.name === name) {
            // 用户存在且姓名匹配，这是“登录”场景
            const userId = existingUser.user_id;
            wx.setStorageSync('user_id', userId);

            wx.showToast({ title: '登录成功！', icon: 'success' });

            // --- 核心改动：调用新的检查函数 ---
            this.checkSubscriptionAndProceed(userId, existingUser);

          } else {
            wx.showToast({ title: '该编号已被注册，请核对。', icon: 'none' });
          }
        } else if (searchRes.statusCode === 404 || searchRes.data.length === 0) {
          // 用户不存在，这是“注册”场景
          this.registerNewUser(name, serialNumber, isDrainageRemoved);
        } else {
          wx.showToast({ title: '查询用户失败，请重试。', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('用户查询请求失败:', err);
        wx.showToast({ title: '网络错误，请稍后再试。', icon: 'none' });
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
                // 更新 openid 成功后，直接显示订阅弹窗（因为新用户或无 openid 的老用户肯定没有订阅）
                this.setData({ showSubscribeModal: true });
              } else {
                wx.showToast({ title: '同步用户信息失败', icon: 'none' });
                console.error('更新 openid 失败:', updateRes);
              }
            },
            fail: (err) => {
              wx.showToast({ title: '网络请求失败', icon: 'none' });
              console.error('请求更新 openid 接口失败:', err);
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

  registerNewUser: function(name, serialNumber, isDrainageRemoved) {
    wx.showLoading({ title: '正在为您注册...' });
    const planIdToAssign = isDrainageRemoved ? 2 : 1;
    const extubationStatus = isDrainageRemoved ? "已拔管" : "未拔管";

    wx.request({
      url: `${this.data.backendBaseUrl}/users`,
      method: 'POST',
      data: {
        name: name,
        srrsh_id: parseInt(serialNumber),
        extubation_status: extubationStatus
      },
      success: (res) => {
        if (res.statusCode === 201) {
          const newUserId = res.data.user.user_id;
          wx.setStorageSync('user_id', newUserId);
          
          wx.request({
            url: `${this.data.backendBaseUrl}/user_recovery_plans`,
            method: 'POST',
            data: { user_id: newUserId, plan_id: planIdToAssign, status: 'active' },
            success: (planRes) => {
              if (planRes.statusCode === 201) {
                wx.hideLoading();
                wx.setStorageSync('user_plan_id', planRes.data.user_plan.user_plan_id);
                // 核心改动：注册成功后，立即为其更新 openid
                console.log('新用户注册成功，开始更新 openid...');
                this.updateUserOpenId(newUserId);
              } else {
                wx.hideLoading();
                wx.showToast({ title: '注册成功但绑定计划失败', icon: 'none' });
              }
            },
            fail: () => {
              wx.hideLoading();
              wx.showToast({ title: '网络错误，绑定计划失败', icon: 'none' });
            }
          });
        } else {
          wx.hideLoading();
          wx.showToast({ title: '注册失败，请重试', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误，注册失败', icon: 'none' });
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

  handleLogin: function () {
    wx.navigateTo({
      url: '/pages/login/login'
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

