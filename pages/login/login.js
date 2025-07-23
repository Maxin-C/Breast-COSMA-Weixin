// login.js
Page({
  /**
   * Page initial data
   */
  data: {
    username: '',
    phoneNum: ''
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
  handlePhoneNumInput: function (e) {
    this.setData({
      phoneNum: e.detail.value
    });
  },

  /**
   * Event handler for the "Log in" button
   */
  handleLogin: function () {
    const { username, phoneNum } = this.data;

    // Basic form validation
    if (!username || !phoneNum) {
      wx.showToast({
        title: 'Please enter username and phone number',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    console.log('Logging in with:', { name: username, phone_number: phoneNum });
    
    // API call to your backend server for user search
    wx.request({
      url: 'http://localhost:8000/users/search', // Base URL + endpoint 
      method: 'GET', 
      data: {
        field: 'name', 
        value: username 
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data.length > 0) { 
          // Check if any of the found users match the phone number
          const user = res.data.find(u => u.phone_number === phoneNum); 
          if (user) {
            const userId = user.user_id;

            // Cache the user_id
            wx.setStorageSync('user_id', userId);

            // Now, find the user_plan_id for this user
            wx.request({
              url: 'http://localhost:8000/user_recovery_plans/search',
              method: 'GET',
              data: {
                field: 'user_id',
                value: userId 
              },
              success: (planRes) => {
                if (planRes.statusCode === 200 && planRes.data.length > 0) {
                  // Assuming a user might have multiple plans, you might want to pick the active one or the first one.
                  // For simplicity, let's take the first plan found.
                  const userPlan = planRes.data[0]; 
                  const userPlanId = userPlan.user_plan_id;

                  // Cache the user_plan_id
                  wx.setStorageSync('user_plan_id', userPlanId);

                  wx.showToast({
                    title: 'Login successful!',
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
                    title: 'Login successful, but no recovery plan found.',
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
                    title: 'Login successful, but failed to get recovery plan.',
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
                  title: 'Login successful, but network error getting recovery plan.',
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
              title: 'Login failed. Invalid phone number.',
              icon: 'none',
              duration: 2000
            });
          }
        } else if (res.statusCode === 404) { 
             wx.showToast({
                title: 'Login failed. User not found.',
                icon: 'none',
                duration: 2000
             });
        }
        else {
          wx.showToast({
            title: 'Login failed. Please check your credentials.',
            icon: 'none',
            duration: 2000
          });
        }
      },
      fail: (err) => {
        console.error('Login request failed:', err);
        wx.showToast({
          title: 'Network error. Please try again.',
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