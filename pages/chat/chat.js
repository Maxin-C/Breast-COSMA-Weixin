const app = getApp();
const MAX_MESSAGES_TO_RENDER = 25;
const plugin = requirePlugin("WechatSI");
const recorderManager = plugin.getRecordRecognitionManager();

Page({
  data: {
    messages: [],
    inputValue: '',
    intoView: 'chat-anchor', // 【新增】滚动目标ID
    scrollViewHeight: 0, // 【新增】用于控制scroll-view的高度
    keyboardHeight: 0, // 【新增】用于存储键盘高度
    conversationId: null,
    userId: null,
    isLoading: false,
    backendBaseUrl: app.globalData.backendBaseUrl,
    currentTime: '',
    mode: 'consult',
    showFollowupModal: false,
    isFollowupCompleted: false,
    isRecording: false
  },

  onLoad(options) {
    const userId = wx.getStorageSync('user_id');
    if (!userId) {
      wx.showToast({ title: '未找到用户ID，请重新登录', icon: 'none' });
      wx.navigateBack();
      return;
    }
    this.setData({ userId: userId });
    this.setCurrentTime();
    
    // 【核心修改】在页面加载后，计算并设置滚动区域的高度
    this.updateScrollViewHeight();

    this.checkFollowupStatus();

    // 【新增】监听键盘高度变化
    wx.onKeyboardHeightChange(res => {
      console.log('键盘高度变化:', res.height);
      this.setData({
        keyboardHeight: res.height
      });
      // 键盘弹起或收起时，都重新计算一次滚动区域高度并滚动到底部
      this.updateScrollViewHeight();
      this.scrollToBottomAnchor();
    });

    this.initRecord();
    this.innerAudioContext = wx.createInnerAudioContext();
    this.innerAudioContext.onError((res) => {
        this.showErrorToast('语音播放失败');
        console.error(res);
    });
  },

  /**
   * 【新增】初始化录音管理器
   */
  initRecord() {
    // 识别结束事件
    recorderManager.onStop = (res) => {
      if (res.result) {
        this.setData({
          inputValue: this.data.inputValue + res.result,
        });
      } else {
        this.showErrorToast('未能识别声音');
      }
    };

    // 识别错误事件
    recorderManager.onError = (res) => {
      this.setData({ isRecording: false });
      this.showErrorToast(`录音失败: ${res.msg}`);
    };
  },

  /**
   * 【新增】处理长按录音开始
   */
  handleRecordStart() {
    this.setData({ isRecording: true });
    recorderManager.start({
      lang: 'zh_CN',
    });
  },

  /**
   * 【新增】处理松开按钮结束录音
   */
  handleRecordEnd() {
    this.setData({ isRecording: false });
    recorderManager.stop();
  },

  extractMainContent(text) {
    const parts = text.split('---');
    if (parts.length > 1) {
      return parts[0].trim();
    }
    return text;
  },

  /**
   * 【新增】文本转语音播放
   */
  handlePlayText(e) {
    const text = e.currentTarget.dataset.text;
    if (!text) return;

    plugin.textToSpeech({
      lang: "zh_CN",
      tts: true,
      content: this.extractMainContent(text),
      success: (res) => {
        if (res.retcode == 0) {
          this.innerAudioContext.src = res.filename;
          this.innerAudioContext.play();
        } else {
          this.showErrorToast('语音合成失败');
          console.error("textToSpeech failed", res);
        }
      },
      fail: (res) => {
        this.showErrorToast('语音合成请求失败');
        console.error("textToSpeech failed", res);
      }
    });
  },

  /**
   * 【新增】一个独立的滚动到底部锚点的函数
   */
  scrollToBottomAnchor() {
    wx.nextTick(() => {
      this.setData({
        intoView: 'chat-anchor'
      });
    });
  },
  
  /**
   * 【核心函数】动态计算并设置 scroll-view 的高度
   */
  updateScrollViewHeight() {
    const query = wx.createSelectorQuery();
    // 选择导航栏和输入栏
    query.select('.nav-bar').boundingClientRect();
    query.select('.input-bar').boundingClientRect();

    query.exec((res) => {
      // res 是一个包含查询结果的数组
      if (res[0] && res[1]) {
        const navBarHeight = res[0].height;
        const inputBarHeight = res[1].height;
        
        // 获取屏幕可用高度
        const screenHeight = wx.getWindowInfo().windowHeight;

        // 计算 scroll-view 的高度
        const scrollViewHeight = screenHeight - navBarHeight - inputBarHeight;

        this.setData({
          scrollViewHeight: scrollViewHeight
        });
        console.log(`[Debug] ScrollView height calculated and set to: ${scrollViewHeight}px`);
      }
    });
  },

  /**
   * 【核心优化】使用 wx.nextTick 确保滚动到底部
   */
  addMessageToChat(message) {
    let currentMessages = this.data.messages;
    if (currentMessages.length >= MAX_MESSAGES_TO_RENDER) {
      currentMessages = currentMessages.slice(-(MAX_MESSAGES_TO_RENDER - 1));
    }
    const newMessages = [...currentMessages, message];

    this.setData({
      messages: newMessages
    }, () => {
        // 在 setData 的回调中执行滚动，确保新消息已渲染
        this.scrollToBottomAnchor();
    });
  },

  // ... (其他函数 handleStartFollowup, handleSend, 等）
  // --- 以下是其他函数的代码 ---
  onShow() {
    if (this.data.userId) {
        this.checkFollowupStatus();
    }
  },

  onUnload() {
    if (this.data.conversationId && this.data.userId) {
      console.log(`页面卸载，正在结束对话: ${this.data.conversationId}`);
      wx.request({
        url: `${this.data.backendBaseUrl}/consult/messages`,
        method: 'POST',
        data: {
          user_id: this.data.userId,
          conversation_id: this.data.conversationId,
          message: "用户已退出页面",
          mode: this.data.mode,
          end_conversation: true
        }
      });
    }
    if (this.innerAudioContext) {
      this.innerAudioContext.destroy();
    }
  },

  checkFollowupStatus() {
    if (this.data.isLoading) return;
    wx.request({
      url: `${this.data.backendBaseUrl}/users/check_followup_status`,
      method: 'GET',
      data: { user_id: this.data.userId },
      success: (res) => {
        if (res.statusCode === 200) {
          const { is_followup_week, has_completed_followup } = res.data;
          if (is_followup_week && !has_completed_followup) {
            this.setData({ showFollowupModal: true });
          } else {
            if (!this.data.conversationId && !this.data.isLoading) {
              this.initConversation('consult');
            }
          }
        } else {
          if (!this.data.conversationId && !this.data.isLoading) {
            this.initConversation('consult');
          }
        }
      },
      fail: () => {
        if (!this.data.conversationId && !this.data.isLoading) {
          this.initConversation('consult');
        }
      }
    });
  },
  
  handleStartFollowup() {
    this.setData({ showFollowupModal: false, messages: [] });
    this.initConversation('followup');
  },
  
  handleDeclineFollowup() {
    this.setData({ showFollowupModal: false, messages: [] });
    this.initConversation('consult');
  },

  setCurrentTime() {
    const now = new Date();
    this.setData({
      currentTime: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    });
  },

  initConversation(mode) {
    this.setData({ isLoading: true, mode: mode, isFollowupCompleted: false, conversationId: null, messages: [] });
    this.addMessageToChat({ type: 'loading' });
    wx.request({
      url: `${this.data.backendBaseUrl}/consult/messages`,
      method: 'POST',
      data: {
        user_id: this.data.userId,
        message: "你好",
        mode: mode,
        end_conversation: false
      },
      success: (res) => {
        this.removeLoadingMessage();
        if (res.statusCode === 200 && res.data.response) {
          this.setData({ conversationId: res.data.conversation_id, isLoading: false });

          const responseText = res.data.response;
          const separator = "\n\n---\n**参考文献:**\n";
          const parts = responseText.split(separator);
          let messageText = responseText;
          let referencesText = null;

          if (parts.length > 1) {
            messageText = parts[0];
            referencesText = parts.slice(1).join('\n');
          }

          this.addMessageToChat({
            sender_type: 'assistant',
            message_text: messageText, // 正文
            references_text: referencesText, // 参考文献 (或 null)
            full_text_for_tts: responseText, // 完整原文，用于TTS
            timestamp: res.data.timestamp
          });
        } else {
          this.showErrorToast('初始化对话失败');
        }
      },
      fail: () => {
        this.removeLoadingMessage();
        this.showErrorToast('网络错误');
      },
    });
  },

  handleInput(e) { this.setData({ inputValue: e.detail.value }); },

  handleSend() {
    const { inputValue, conversationId, userId, mode, isFollowupCompleted } = this.data;
    if (!inputValue.trim() || this.data.isLoading) return;

    this.addMessageToChat({
      sender_type: 'user',
      message_text: inputValue,
      timestamp: new Date().toISOString()
    });
    this.addMessageToChat({ type: 'loading' });
    this.setData({ isLoading: true, inputValue: '' });

    wx.request({
      url: `${this.data.backendBaseUrl}/consult/messages`,
      method: 'POST',
      data: {
        user_id: userId,
        conversation_id: conversationId,
        message: inputValue,
        mode: isFollowupCompleted ? 'consult' : mode,
        end_conversation: false
      },
      success: (res) => {
        this.removeLoadingMessage();
        if (res.statusCode === 200 && res.data.response) {
          if (res.data.conversation_id) {
            this.setData({ conversationId: res.data.conversation_id });
          }
          const responseText = res.data.response;
          const separator = "\n\n---\n**参考文献:**\n";
          const parts = responseText.split(separator);
          let messageText = responseText;
          let referencesText = null;
          
          if (parts.length > 1) {
            messageText = parts[0];
            referencesText = parts.slice(1).join('\n');
          }

          this.addMessageToChat({
            sender_type: 'assistant',
            message_text: messageText, // 正文
            references_text: referencesText, // 参考文献 (或 null)
            full_text_for_tts: responseText, // 完整原文，用于TTS
            timestamp: res.data.timestamp
          });
          if (res.data.followup_complete) {
            this.handleFollowupCompletion(res.data.followup_results);
          }
        } else {
          this.showErrorToast('发送失败');
        }
      },
      fail: () => {
        this.removeLoadingMessage();
        this.showErrorToast('网络错误');
      },
      complete: () => {
        this.setData({ isLoading: false });
      }
    });
  },

  handleFollowupCompletion(results) {
    if (results && results.scoring_result) {
      this.setData({ isFollowupCompleted: true, mode: 'consult' });
      wx.setStorageSync('is_follow_up_week', false)
      this.addMessageToChat({ type: 'loading', message_text: '正在处理随访结果...' });
      
      setTimeout(() => {
        this.removeLoadingMessage();
        this.addMessageToChat({
          type: 'result',
          data: results.scoring_result,
          timestamp: new Date().toISOString()
        });
      }, 15000);
    }
  },

  removeLoadingMessage() {
    const newMessages = this.data.messages.filter(msg => msg.type !== 'loading');
    this.setData({ messages: newMessages });
  },

  showErrorToast(message) {
    wx.showToast({ title: message, icon: 'none', duration: 2000 });
  },

  handleHome() {
    if (this.data.mode === 'followup' && !this.data.isFollowupCompleted) {
      wx.showModal({
        title: '确认退出',
        content: '随访尚未完成，现在退出将无法保存进度，确认要退出吗？',
        success: (res) => {
          if (res.confirm) {
            wx.redirectTo({ url: '/pages/home/home' });
          }
        }
      });
    } else {
      wx.redirectTo({ url: '/pages/home/home' });
    }
  }
});