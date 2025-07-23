// signup.js
Page({
  /**
   * Page initial data
   */
  data: {
    name: '',
    phoneNum: '',
    srrshId: ''
  },

  /**
   * Event handler for name input
   */
  handleNameInput: function (e) {
    this.setData({
      name: e.detail.value
    });
  },

  /**
   * Event handler for phone number input
   */
  handlePhoneNumInput: function (e) {
    this.setData({
      phoneNum: e.detail.value
    });
  },

  /**
   * Event handler for SRRSH ID input
   */
  handleSrrshIdInput: function (e) {
    this.setData({
      srrshId: e.detail.value
    });
  },

  /**
   * Event handler for the "Register" button
   */
  handleSignUp: function () {
    const { name, phoneNum, srrshId } = this.data;

    // Basic form validation
    if (!name || !phoneNum || !srrshId) {
      wx.showToast({
        title: '请填写所有必填项',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    // Optional: Add more robust validation for phone number and SRRSH ID formats
    if (!/^\d{11}$/.test(phoneNum)) {
      wx.showToast({
        title: '手机号格式不正确',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    if (!/^\d+$/.test(srrshId)) {
      wx.showToast({
        title: '病例号格式不正确',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    console.log('Attempting to sign up or log in with:', { name, phone_number: phoneNum, srrsh_id: srrshId });

    // Step 1: Check if user already exists
    wx.request({
      url: 'http://localhost:8000/users/search',
      method: 'GET',
      data: {
        field: 'name',
        value: name
      },
      success: (searchRes) => {
        if (searchRes.statusCode === 200 && searchRes.data.length > 0) {
          const existingUser = searchRes.data.find(u => u.phone_number === phoneNum);
          if (existingUser) {
            // User exists, proceed with login logic
            const userId = existingUser.user_id;
            wx.setStorageSync('user_id', userId);

            // Find user_plan_id
            wx.request({
              url: 'http://localhost:8000/user_recovery_plans/search',
              method: 'GET',
              data: {
                field: 'user_id',
                value: userId
              },
              success: (planRes) => {
                let userPlanId = null;
                if (planRes.statusCode === 200 && planRes.data.length > 0) {
                  userPlanId = planRes.data[0].user_plan_id; // Take the first plan
                  wx.setStorageSync('user_plan_id', userPlanId);
                  wx.showToast({
                    title: '用户已存在，直接登录成功！',
                    icon: 'success',
                    duration: 1500
                  });
                } else {
                  console.warn('用户已存在，但未找到恢复计划。');
                  wx.showToast({
                    title: '用户已存在，登录成功但未找到恢复计划。',
                    icon: 'none',
                    duration: 2000
                  });
                }
                wx.navigateTo({
                  url: '/pages/home/home'
                });
              },
              fail: (planErr) => {
                console.error('获取用户恢复计划失败:', planErr);
                wx.showToast({
                  title: '用户已存在，登录成功但获取恢复计划失败。',
                  icon: 'none',
                  duration: 2000
                });
                wx.navigateTo({
                  url: '/pages/home/home'
                });
              }
            });
          } else {
            // Name exists, but phone number doesn't match, proceed to register new user
            this.registerNewUser(name, phoneNum, srrshId);
          }
        } else if (searchRes.statusCode === 404 || searchRes.data.length === 0) {
          // User not found, proceed to register new user
          this.registerNewUser(name, phoneNum, srrshId);
        } else {
          wx.showToast({
            title: searchRes.data.message || '查询用户失败，请重试。',
            icon: 'none',
            duration: 2000
          });
          console.error('User search failed:', searchRes.data);
        }
      },
      fail: (err) => {
        console.error('用户查询请求失败:', err);
        wx.showToast({
          title: '网络错误，请稍后再试。',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  // Helper function to handle new user registration and plan binding
  registerNewUser: function(name, phoneNum, srrshId) {
    wx.request({
      url: 'http://localhost:8000/users', // Base URL + endpoint for adding users
      method: 'POST',
      data: {
        name: name,
        phone_number: phoneNum,
        srrsh_id: parseInt(srrshId)
      },
      success: (res) => {
        if (res.statusCode === 201) {
          const newUserId = res.data.user.user_id;
          wx.setStorageSync('user_id', newUserId); // Cache new user_id

          // Bind new user to plan_id: 1
          wx.request({
            url: 'http://localhost:8000/user_recovery_plans',
            method: 'POST',
            data: {
              user_id: newUserId,
              plan_id: 1, // Automatically assign to plan_id 1
              status: 'active'
            },
            success: (planRes) => {
              if (planRes.statusCode === 201) {
                const newUserPlanId = planRes.data.user_plan.user_plan_id;
                wx.setStorageSync('user_plan_id', newUserPlanId); // Cache new user_plan_id

                wx.showToast({
                  title: '注册成功并绑定恢复计划！',
                  icon: 'success',
                  duration: 1500
                });
                wx.navigateTo({
                  url: '/pages/home/home'
                });
              } else {
                wx.showToast({
                  title: planRes.data.message || '注册成功但绑定恢复计划失败，请联系管理员。',
                  icon: 'none',
                  duration: 2000
                });
                console.error('Failed to bind user to recovery plan:', planRes.data);
                wx.navigateTo({
                  url: '/pages/home/home'
                });
              }
            },
            fail: (planErr) => {
              console.error('User recovery plan binding request failed:', planErr);
              wx.showToast({
                title: '注册成功但网络错误，未能绑定恢复计划。',
                icon: 'none',
                duration: 2000
              });
              wx.navigateTo({
                url: '/pages/home/home'
              });
            }
          });
        } else {
          wx.showToast({
            title: res.data.message || '注册失败，请重试。',
            icon: 'none',
            duration: 2000
          });
          console.error('Registration failed:', res.data);
        }
      },
      fail: (err) => {
        console.error('Registration request failed:', err);
        wx.showToast({
          title: '网络错误，请稍后再试。',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  /**
   * Event handler for the "Login" link
   */
  handleLogin: function () {
    console.log('Login link clicked.');
    wx.navigateTo({
      url: '/pages/login/login'
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

  /**
   * Lifecycle function--Called when page is hidden
   */
  onHide: function () {

  },

  /**
   * Lifecycle function--Called when page is unloaded
   */
  onUnload: function () {

  },

  /**
   * Page event handler function--Called when user drop down
   */
  onPullDownRefresh: function () {

  },

  /**
   * Called when page scroll to the bottom
   */
  onReachBottom: function () {

  },

  /**
   * Called when user click on the top-right button to share
   */
  onShareAppMessage: function () {

  }
});