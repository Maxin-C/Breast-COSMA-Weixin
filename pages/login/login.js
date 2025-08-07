// login.js
const app = getApp();
Page({
  /**
   * Page initial data
   */
  data: {
    username: '',
    phoneNum: '',
    backendBaseUrl: app.globalData.backendBaseUrl
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
   * Event handler for phone number input
   */
  // handlePhoneNumInput: function (e) {
  //   this.setData({
  //     phoneNum: e.detail.value
  //   });
  // },

  /**
   * Event handler for the "Log in" button
   */
  handleLogin: function () {
    const { username } = this.data; // 仅获取用户名

    // Basic form validation
    if (!username) { // 仅检查用户名是否为空
      wx.showToast({
        title: '请输入你的姓名', // 更新提示信息
        icon: 'none',
        duration: 2000
      });
      return;
    }

    console.log('Logging in with:', { name: username });
    
    // API call to your backend server for user search
    wx.request({
      url: `${this.data.backendBaseUrl}/users/search`, // Base URL + endpoint 
      method: 'GET', 
      data: {
        field: 'name', 
        value: username 
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data.length > 0) { 
          // 用户名正确，直接使用返回的第一个用户进行登录
          const user = res.data[0]; 
          const userId = user.user_id;

          // Cache the user_id
          wx.setStorageSync('user_id', userId);

          // Now, find the user_plan_id for this user
          wx.request({
            url: `${this.data.backendBaseUrl}/user_recovery_plans/search`,
            method: 'GET',
            data: {
              field: 'user_id',
              value: userId 
            },
            success: (planRes) => {
              if (planRes.statusCode === 200 && planRes.data.length > 0) {
                // For simplicity, let's take the first plan found.
                const userPlan = planRes.data[0]; 
                const userPlanId = userPlan.user_plan_id;

                // Cache the user_plan_id
                wx.setStorageSync('user_plan_id', userPlanId);

                wx.showToast({
                  title: '登录成功!',
                  icon: 'success',
                  duration: 1500
                });
                // Navigate to the main application page
                wx.navigateTo({
                  url: '/pages/home/home'
                });
              } else if (planRes.statusCode === 404) {
                console.warn('No recovery plan found for this user.');
                wx.showToast({
                  title: '登录成功，但是未找到匹配的锻炼方案。',
                  icon: 'none',
                  duration: 2000
                });
                // Still navigate, but the app might need to handle missing plan
                wx.navigateTo({
                  url: '/pages/home/home'
                });
              } 
              else {
                console.error('Failed to retrieve user recovery plans:', planRes);
                wx.showToast({
                  title: '登录成功，但是未找到匹配的锻炼方案。',
                  icon: 'none',
                  duration: 2000
                });
                 wx.navigateTo({
                  url: '/pages/home/home'
                });
              }
            },
            fail: (planErr) => {
              console.error('User recovery plan request failed:', planErr);
              wx.showToast({
                title: '登录成功，但是未找到匹配的锻炼方案。',
                icon: 'none',
                duration: 2000
              });
               wx.navigateTo({
                url: '/pages/home/home'
              });
            }
          });

        } else if (res.statusCode === 404) { 
             wx.showToast({
                title: '登录失败，请注册您的账户',
                icon: 'none',
                duration: 2000
             });
        }
        else {
          wx.showToast({
            title: '登录失败',
            icon: 'none',
            duration: 2000
          });
        }
      },
      fail: (err) => {
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
   * Event handler for the "Sign up" link
   */
  handleSignUp: function () {
    console.log('Sign up link clicked.');
    // Navigate to the registration page
    wx.navigateTo({
      url: '/pages/signup/signup' // Replace with your sign up page path
    });
  },

  /**
   * Lifecycle function--Called when page is initially rendered
   */
  onLoad: function (options) {

  },

  /**
   * Lifecycle function--Called when page is shown
   */
  onShow: function () {

  },
  
  // Other lifecycle and event functions...
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {}
});