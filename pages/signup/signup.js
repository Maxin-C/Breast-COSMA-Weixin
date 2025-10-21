const app = getApp();

function getTodayDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return [year, month, day].map(n => n.toString().padStart(2, '0')).join('-');
}

Page({
  data: {
    name: '',
    surgeryDate: '',
    nurseId: '',
    endDate: getTodayDate(),
    backendBaseUrl: app.globalData.backendBaseUrl,
    templateId: app.globalData.templateId[0],
  },

  handleNameInput: function (e) { this.setData({ name: e.detail.value }); },
  handleDateChange: function (e) { this.setData({ surgeryDate: e.detail.value }); },
  handleNurseIdInput: function (e) { this.setData({ nurseId: e.detail.value }); },

  handleSignUp: function () {
    const { name, surgeryDate, nurseId } = this.data;
    if (!name || !surgeryDate || !nurseId) {
      wx.showToast({ title: '请填写所有必填项', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '正在为您注册...' });

    wx.request({
      url: `${this.data.backendBaseUrl}/users/register`,
      method: 'POST',
      data: {
        name: name,
        surgery_date: surgeryDate,
        nurse_id: nurseId
      },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 201) {
          wx.showToast({ title: '注册成功！', icon: 'success' });
          
          const newUser = res.data.user;
          const newPlan = res.data.user_plan;

          wx.setStorageSync('user_id', newUser.user_id);
          wx.setStorageSync('user_plan_id', newPlan.user_plan_id);
          
          // 新用户注册后，立即同步openid并检查随访状态
          this.updateUserOpenIdAndCheckFollowup(newUser.user_id);
        } else {
          const errorMsg = res.data.error || '注册失败，请重试';
          wx.showToast({ title: errorMsg, icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误，注册失败', icon: 'none' });
      }
    });
  },
  
  updateUserOpenIdAndCheckFollowup: function (userId) {
    wx.showLoading({ title: '正在同步信息...' });
    wx.login({
      success: (res) => {
        if (res.code) {
          wx.request({
            url: `${this.data.backendBaseUrl}/users/update_openid`,
            method: 'POST',
            data: { user_id: userId, code: res.code },
            complete: () => { // 无论openid同步成功与否，都继续检查随访
              wx.hideLoading();
              // 【核心修改】注册成功后，直接检查随访状态
              // 因为是第0周，一定会进入随访流程
              wx.setStorageSync("is_follow_up_week", true)
              wx.redirectTo({
                url: `/pages/chat/chat?showFollowupPrompt=true`
              });
            }
          });
        } else {
          wx.hideLoading();
          // 即使获取code失败，也尝试跳转到随访页
          wx.setStorageSync("is_follow_up_week", true)
          wx.redirectTo({
            url: `/pages/chat/chat?showFollowupPrompt=true`
          });
        }
      },
      fail: () => {
        wx.hideLoading();
        // 即使微信登录失败，也尝试跳转到随访页
        wx.setStorageSync("is_follow_up_week", true)
        wx.redirectTo({
          url: `/pages/chat/chat?showFollowupPrompt=true`
        });
      }
    });
  },

  handleLogin: function () {
    wx.redirectTo({
      url: `/pages/login/login`
    });
  },
});