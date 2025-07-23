// pages/chat/chat.js
Page({
  data: {
    messages: [], // Will be populated from the backend or with default message
    inputValue: '', // Input box content
    scrollTop: 0, // Changed from scrollIntoViewId to scrollTop for programmatic scrolling
    conversationId: '', // Will be dynamic based on existing conversations or new one
    userId: 1, // Placeholder: Current logged-in user's ID
    assistantId: 999, // Replace with the actual user_id of your assistant/robot
    currentTime: ''
  },

  onLoad(options) {
    // Set current time for the time tag
    const now = new Date();
    this.setData({
      currentTime: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    });

    // First, try to get the latest conversation ID for the user
    this.getLatestConversation();
  },

  onReady() {
    // Dynamically set navigation bar padding-top for adaptation
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    const systemInfo = wx.getSystemInfoSync();
    const navBarHeight = menuButtonInfo.bottom + menuButtonInfo.top - systemInfo.statusBarHeight;
    this.setData({
      navBarHeight: navBarHeight,
      // Adjust padding-top based on design
      navBarPaddingTop: systemInfo.statusBarHeight + 4
    });
  },

  handleHome: function() {
    wx.navigateBack(); // Go back to the previous page (assuming home is the previous)
  },

  // Scroll to the bottom of the chat using scrollTop
  scrollToBottom() {
    // Use wx.nextTick to ensure data update has been committed to the render layer
    wx.nextTick(() => {
      // Introduce a slightly longer timeout to allow the rendering engine
      // to fully complete layout updates and calculate the correct scrollHeight.
      // This is crucial for dynamic content like chat messages.
      setTimeout(() => {
        wx.createSelectorQuery().select('.chat-body').scrollOffset(function(res) {
          // scrollOffset provides scrollHeight directly
          if (res && res.scrollHeight) {
            this.setData({
              scrollTop: res.scrollHeight // Set scroll position to the total content height
            });
          }
        }.bind(this)).exec();
      }, 300); // Increased delay to 300ms for more reliability
    });
  },

  // Event handler for input field
  handleInput: function(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  // Get the latest conversation for the current user
  getLatestConversation: function() {
    wx.request({
      url: `http://localhost:8000/messages_chat/search`, // Search endpoint for messages
      method: 'GET',
      data: {
        field: 'sender_id', // Search by sender_id to find user's conversations
        value: this.data.userId
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.length > 0) {
          // Filter messages to only include those where the receiver is the assistant
          // This helps in identifying distinct conversations with the assistant
          const userToAssistantMessages = res.data.filter(msg => 
            msg.sender_id === this.data.userId && msg.receiver_id === this.data.assistantId
          );

          if (userToAssistantMessages.length > 0) {
            // Group messages by conversation_id and find the latest conversation
            const conversations = {};
            userToAssistantMessages.forEach(msg => {
              if (!conversations[msg.conversation_id]) {
                conversations[msg.conversation_id] = [];
              }
              conversations[msg.conversation_id].push(msg);
            });

            // Find the conversation with the latest message
            let latestConversationId = '';
            let latestTimestamp = 0;

            for (const convoId in conversations) {
              const latestMsgInConvo = conversations[convoId].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
              const currentConvoTimestamp = new Date(latestMsgInConvo.timestamp).getTime();
              if (currentConvoTimestamp > latestTimestamp) {
                latestTimestamp = currentConvoTimestamp;
                latestConversationId = convoId;
              }
            }

            console.log('Found latest conversation ID:', latestConversationId);
            this.setData({
              conversationId: latestConversationId
            }, () => {
              this.fetchLatestTwoRoundsMessages(latestConversationId); // Fetch only the last 2 rounds
            });
          } else {
            console.log('No existing conversations with the assistant found, starting a new one.');
            this.startNewConversation();
          }
        } else if (res.statusCode === 404 || res.data.length === 0) {
          console.log('No existing conversations found, starting a new one.');
          this.startNewConversation();
        } else {
          console.error('Failed to retrieve conversations:', res);
          this.startNewConversation(); // Fallback to new conversation on error
        }
      },
      fail: (err) => {
        console.error('Request failed:', err);
        this.startNewConversation(); // Fallback to new conversation on network error
      }
    });
  },

  // Start a new conversation with a default message
  startNewConversation: function() {
    const newConversationId = `convo_${Date.now()}_${this.data.userId}`; // Generate a unique ID
    const defaultMessage = {
      conversation_id: newConversationId,
      sender_id: this.data.assistantId, // Assistant sends the first message
      sender_type: 'assistant',
      receiver_id: this.data.userId,
      receiver_type: 'user',
      message_text: "你好，请问有什么可以帮助您的吗？",
      timestamp: new Date().toISOString().slice(0, 19).replace('T', ' ') // Current timestamp
    };

    wx.request({
      url: 'http://localhost:8000/messages_chat', // Endpoint to add message
      method: 'POST',
      data: defaultMessage,
      success: (res) => {
        if (res.statusCode === 201) { // 201 Created for successful POST
          console.log('Default message sent and new conversation started:', res.data);
          this.setData({
            conversationId: newConversationId,
            messages: [res.data.chat] // Add the default message returned from backend
          }, () => {
            this.scrollToBottom(); // Scroll after adding message
          });
        } else {
          console.error('Failed to send default message:', res);
          wx.showToast({
            title: res.data.message || '发送默认消息失败，请重试。',
            icon: 'none',
            duration: 2000
          });
          // Fallback to local display if API call fails
          this.setData({
            conversationId: newConversationId,
            messages: [{
              message_id: 'default_msg', // Assign a local ID for display
              conversation_id: newConversationId,
              sender_type: 'assistant',
              message_text: "你好，请问有什么可以帮助您的吗？",
              timestamp: defaultMessage.timestamp
            }]
          }, () => {
            this.scrollToBottom(); // Scroll after adding message
          });
        }
      },
      fail: (err) => {
        console.error('Failed to send default message (network error):', err);
        wx.showToast({
          title: '网络错误，发送默认消息失败。',
          icon: 'none',
          duration: 2000
        });
        // Fallback to local display if API call fails
        this.setData({
          conversationId: newConversationId,
          messages: [{
            message_id: 'default_msg', // Assign a local ID for display
            conversation_id: newConversationId,
            sender_type: 'assistant',
            message_text: "你好，请问有什么可以帮助您的吗？",
            timestamp: defaultMessage.timestamp
          }]
        }, () => {
          this.scrollToBottom(); // Scroll after adding message
        });
      }
    });
  },

  // Fetch the last two rounds of messages for a given conversation ID
  fetchLatestTwoRoundsMessages: function(conversationId) {
    wx.request({
      url: `http://localhost:8000/messages_chat/search`, // Search endpoint for messages
      method: 'GET',
      data: {
        field: 'conversation_id',
        value: conversationId
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          const sortedMessages = res.data.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

          // Filter for the last two rounds of conversation
          // A "round" consists of a user message and an assistant response.
          const lastTwoRounds = [];
          let userMessagesCount = 0;
          let assistantMessagesCount = 0;

          // Iterate from the end to find the last two full rounds
          for (let i = sortedMessages.length - 1; i >= 0; i--) {
            const message = sortedMessages[i];
            if (message.sender_type === 'user' && message.sender_id === this.data.userId) {
              userMessagesCount++;
            } else if (message.sender_type === 'assistant' && message.sender_id === this.data.assistantId) {
              assistantMessagesCount++;
            }
            lastTwoRounds.unshift(message); // Add to the beginning to maintain order

            // If we have at least two user messages and two assistant messages,
            // we have at least two full rounds.
            if (userMessagesCount >= 2 && assistantMessagesCount >= 2) {
              break;
            }
          }
          
          // Ensure we only display the last two full rounds.
          // This logic might need refinement based on exact "round" definition.
          // For simplicity, we'll take the last 4 messages if available, assuming
          // they form the last two rounds (user, assistant, user, assistant).
          const messagesToDisplay = lastTwoRounds.slice(Math.max(lastTwoRounds.length - 4, 0));

          this.setData({
            messages: messagesToDisplay
          }, () => {
            this.scrollToBottom();
          });
        } else if (res.statusCode === 404) {
          console.log('No messages found for this conversation ID, or error.');
          this.setData({ messages: [] }); // Clear messages if none found for the ID
          this.startNewConversation(); // Start a new conversation if no messages for existing ID
        } else {
          console.error('Failed to fetch messages for conversation:', res);
          wx.showToast({
            title: '获取聊天记录失败',
            icon: 'none',
            duration: 1500
          });
          this.startNewConversation(); // Fallback to new conversation on error
        }
      },
      fail: (err) => {
        console.error('Request failed:', err);
        wx.showToast({
          title: '网络错误，无法获取聊天记录',
          icon: 'none',
          duration: 1500
        });
        this.startNewConversation(); // Fallback to new conversation on network error
      }
    });
  },

  // Event handler for sending a message
  handleSend: function() {
    const messageText = this.data.inputValue.trim();
    if (!messageText) {
      wx.showToast({
        title: '消息不能为空',
        icon: 'none',
        duration: 1000
      });
      return;
    }

    // Generate a new conversation ID for this new interaction
    const newConversationId = `convo_${Date.now()}_${this.data.userId}`;

    const newMessage = {
      conversation_id: newConversationId, // Use the new conversation ID
      sender_id: this.data.userId,
      sender_type: 'user',
      receiver_id: this.data.assistantId,
      receiver_type: 'assistant',
      message_text: messageText,
      timestamp: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };

    // Optimistically add message to UI with a temporary ID
    const tempMessage = { ...newMessage, message_id: `temp_${Date.now()}` };
    this.setData({
      messages: [...this.data.messages, tempMessage],
      inputValue: '',
      conversationId: newConversationId // Update conversationId to the new one
    }, () => {
      this.scrollToBottom(); // Scroll after user message is added
    });

    // Send message to backend
    wx.request({
      url: 'http://localhost:8000/messages_chat', // Endpoint to add message
      method: 'POST',
      data: newMessage,
      success: (res) => {
        if (res.statusCode === 201) { // 201 Created for successful POST
          console.log('Message sent successfully:', res.data);
          // Replace temporary message with actual message_id from backend
          const updatedMessages = this.data.messages.map(msg =>
            msg.message_id === tempMessage.message_id ? res.data.chat : msg
          );
          this.setData({
            messages: updatedMessages
          });

          // Placeholder for AI response - In a real scenario, you'd make another API call here
          // to your AI chatbot service and then add its response to messages.
          this.simulateAIResponse(this.data.userId, newConversationId); // Pass the new conversation ID
        } else {
          console.error('Failed to send message:', res);
          wx.showToast({
            title: res.data.message || '发送失败，请重试',
            icon: 'none',
            duration: 1500
          });
          // Revert optimistic update if sending failed
          this.setData({
            messages: this.data.messages.filter(msg => msg.message_id !== tempMessage.message_id),
            inputValue: messageText // Put text back in input
          });
        }
      },
      fail: (err) => {
        console.error('Message send request failed:', err);
        wx.showToast({
          title: '网络错误，发送失败',
          icon: 'none',
          duration: 1500
        });
        // Revert optimistic update if sending failed
        this.setData({
          messages: this.data.messages.filter(msg => msg.message_id !== tempMessage.message_id),
          inputValue: messageText // Put text back in input
        });
      }
    });
  },

  // Simulates an AI response and adds it to the chat, then saves it to the backend
  simulateAIResponse: function(userId, conversationId) {
    const aiMessageText = "我已收到您的问题，请稍等，我正在为您分析..."; // Example AI response
    const aiResponse = {
      conversation_id: conversationId,
      sender_id: this.data.assistantId,
      sender_type: 'assistant',
      receiver_id: userId,
      receiver_type: 'user',
      message_text: aiMessageText,
      timestamp: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };

    wx.request({
      url: 'http://localhost:8000/messages_chat',
      method: 'POST',
      data: aiResponse,
      success: (res) => {
        if (res.statusCode === 201) {
          console.log('AI response saved:', res.data);
          this.setData({
            messages: [...this.data.messages, res.data.chat] // Add AI message with actual ID from backend
          }, () => {
            this.scrollToBottom(); // Scroll after AI message is added
          });
        } else {
          console.error('Failed to save AI response:', res);
        }
      },
      fail: (err) => {
        console.error('AI response save request failed:', err);
      }
    });
  }
});
