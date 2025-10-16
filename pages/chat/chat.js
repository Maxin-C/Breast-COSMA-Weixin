// pages/chat/chat.js
const app = getApp();

Page({
  data: {
    messages: [],
    inputValue: '',
    scrollTop: 0,
    conversationId: null, // 初始为null，等待API返回
    userId: 1, // 实际应用中应从全局状态获取
    isLoading: false,
    backendBaseUrl: app.globalData.backendBaseUrl
  },

  onLoad() {
    this.initConversation();
    this.setCurrentTime();

    const userId = wx.getStorageSync('user_id');
    
    if (userId) {
      this.setData({
        userId: userId // Update data with the retrieved userId
      });
      // Fetch user info and calculate weekly progress when the page loads
      // this.fetchUserData(userId);
      // this.calculateWeeklyProgress(userId);
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

  setCurrentTime() {
    const now = new Date();
    this.setData({
      currentTime: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    });
  },

  // 初始化对话
  initConversation() {
    this.setData({ isLoading: true });
    
    // 1. 尝试创建新对话
    wx.request({
      url: `${this.data.backendBaseUrl}/api/chat/conversations`,
      method: 'POST',
      data: { user_id: this.data.userId },
      success: (res) => {
        if (res.statusCode === 201) {
          const conversationId = res.data.conversation_id;
          this.setData({ conversationId });
          
          // 2. 获取初始问候语
          this.getInitialGreeting(conversationId);
        } else {
          this.showErrorToast('初始化对话失败');
        }
      },
      fail: (err) => {
        console.error('创建对话失败:', err);
        this.showErrorToast('网络错误');
      },
      complete: () => {
        this.setData({ isLoading: false });
      }
    });
  },

  // 获取初始问候语
  getInitialGreeting(conversationId) {
    wx.request({
      url: `${this.data.backendBaseUrl}/api/chat/conversations/${conversationId}/messages`,
      method: 'POST',
      data: {
        user_id: this.data.userId,
        message: "你好"
      },
      success: (res) => {
        if (res.statusCode === 200) {
          this.addMessageToChat({
            sender_type: 'assistant',
            message_text: res.data.response,
            timestamp: res.data.timestamp
          });
        }
      },
      fail: (err) => {
        console.error('获取问候语失败:', err);
      }
    });
  },

  // 处理输入
  handleInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  // 发送消息
  handleSend() {
    const { inputValue, conversationId } = this.data;
    if (!inputValue.trim()) {
      wx.showToast({ title: '消息不能为空', icon: 'none' });
      return;
    }

    this.setData({ isLoading: true });
    
    // 1. 先添加用户消息到本地
    this.addMessageToChat({
      sender_type: 'user',
      message_text: inputValue,
      timestamp: new Date().toISOString()
    });

    // 2. 发送到服务器
    wx.request({
      url: `${this.data.backendBaseUrl}/api/chat/conversations/${conversationId}/messages`,
      method: 'POST',
      data: {
        user_id: this.data.userId,
        message: inputValue
      },
      success: (res) => {
        if (res.statusCode === 200) {
          this.addMessageToChat({
            sender_type: 'assistant',
            message_text: res.data.response,
            timestamp: res.data.timestamp
          });
          this.setData({ inputValue: '' });
        } else {
          this.showErrorToast('发送失败');
        }
      },
      fail: (err) => {
        console.error('发送消息失败:', err);
        this.showErrorToast('网络错误');
      },
      complete: () => {
        this.setData({ isLoading: false });
      }
    });
  },

  // 添加消息到聊天界面
  addMessageToChat(message) {
    this.setData({
      messages: [...this.data.messages, message]
    }, () => {
      this.scrollToBottom();
    });
  },

  // 滚动到底部
  scrollToBottom() {
    wx.nextTick(() => {
      setTimeout(() => {
        this.setData({
          scrollTop: 99999 // 足够大的值确保滚动到底部
        });
      }, 300);
    });
  },

  // 显示错误提示
  showErrorToast(message) {
    wx.showToast({
      title: message,
      icon: 'none',
      duration: 2000
    });
  },

  // 返回首页
  handleHome() {
    wx.navigateBack();
  }
});