// pages/exercise/exercise.js

Page({
  data: {
    // UI State (UI状态)
    isTrainingStarted: false, // Overall training session started/not (训练会话是否已开始)
    isCameraVisibleForUser: false, // Controls if camera feed is visually shown to user (控制摄像头画面是否对用户可见)
    isPositioned: false, // User's upper body is in frame (用户上半身是否在画面内)
    isPaused: false, // Training paused state (训练暂停状态)
    showLoading: false, // Video loading indicator (视频加载指示器)

    // Camera related (摄像头相关)
    cameraContext: null,
    countdown: 30, // Countdown for initial positioning (初始定位倒计时)
    countdownTimer: null, // Timer ID for positioning countdown (定位倒计时计时器ID)
    cameraMonitoringInterval: null, // Interval for continuous camera monitoring (positioning & general check) (持续摄像头监控的间隔，用于定位和常规检查)
    cameraHeight: 300, // Dynamic height for camera view (摄像头视图的动态高度)

    // Video related (视频相关)
    videoPlayer: null, // wx.createVideoContext
    currentVideoUrl: '',
    currentActionIndex: 0, // Index in the actionSequence array (动作序列数组中的当前索引)
    actionSequence: [], // Array of video actions (视频动作数组)
    currentActionName: '',

    // Progress tracking (进度跟踪)
    totalDemonstrationVideos: 0, // Total 'demonstration' videos (总的“演示”视频数量)
    completedDemonstrationVideos: 0, // Count of completed 'demonstration' videos (已完成的“演示”视频数量)
    totalProgressPercentage: 0, // Overall training progress (0-100%) (总训练进度百分比)

    // Sprite Sheet related (for 'demonstration' videos) (雪碧图相关，用于“演示”视频)
    spriteFramesBuffer: [], // Buffer for collecting frames (收集帧的缓冲区)
    maxSpriteFrames: 6, // 6 frames per second for sprite sheet (雪碧图每秒6帧)
    spriteSheetSendingInterval: null, // Interval for sending sprite sheets (发送雪碧图的间隔)
    isCapturingAndSendingFrames: false, // Flag to control frame capture (控制帧捕获的标志)

    // Backend Configuration (后端配置)
    backendBaseUrl: 'https://bmi.joyrunmed.com',
  },

  /**
   * Lifecycle function: onLoad
   * Initializes camera context and action sequence.
   * 生命周期函数：onLoad
   * 初始化摄像头上下文和动作序列。
   */
  onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    this.setData({
      cameraHeight: sysInfo.windowHeight * 0.7, // Set camera height to 70% of window height (将摄像头高度设置为窗口高度的70%)
      isTrainingStarted: false, // Ensure initial state is false on load (确保加载时初始状态为false)
    });

    this.data.cameraContext = wx.createCameraContext();
    this.initializeActionSequence();
  },

  /**
   * Lifecycle function: onUnload
   * Clears all active timers to prevent memory leaks.
   * 生命周期函数：onUnload
   * 清除所有活动计时器以防止内存泄漏。
   */
  onUnload() {
    this.clearAllTimers();
  },

  /**
   * Clears all setInterval timers.
   * 清除所有 setInterval 计时器。
   */
  clearAllTimers() {
    if (this.data.countdownTimer) {
      clearInterval(this.data.countdownTimer);
      this.data.countdownTimer = null;
    }
    if (this.data.cameraMonitoringInterval) {
      clearInterval(this.data.cameraMonitoringInterval);
      this.data.cameraMonitoringInterval = null;
    }
    if (this.data.spriteSheetSendingInterval) {
      clearInterval(this.data.spriteSheetSendingInterval);
      this.data.spriteSheetSendingInterval = null;
    }
    // Clear the sprite buffer if timers are cleared (如果计时器被清除，则清除雪碧图缓冲区)
    this.data.spriteFramesBuffer = [];
  },

  /**
   * Initializes the sequence of exercise actions (explanation and demonstration videos).
   * 初始化锻炼动作序列（讲解和演示视频）。
   */
  initializeActionSequence() {
    const sequence = [];
    const totalExercises = 5;
    let demonstrationCount = 0;

    const BASE_VIDEO_URL = `${this.data.backendBaseUrl}/static/videos/`;

    for (let i = 1; i <= totalExercises; i++) {
      sequence.push({
        type: 'explanation',
        name: `动作${i}讲解`,
        url: `${BASE_VIDEO_URL}intro/${i}.mp4`,
        exerciseNumber: i
      });
      sequence.push({
        type: 'demonstration',
        name: `动作${i}演示`,
        url: `${BASE_VIDEO_URL}guide/${i}.mp4`,
        exerciseNumber: i
      });
      demonstrationCount++;
    }

    this.setData({
      actionSequence: sequence,
      totalDemonstrationVideos: demonstrationCount
    });
  },

  /**
   * Initiates the training process.
   * Shows camera and starts the positioning check.
   * 启动训练过程。
   * 显示摄像头并开始定位检查。
   */
  startTraining() {
    this.setData({
      isTrainingStarted: true,
      isCameraVisibleForUser: true, // Show camera for initial positioning (显示摄像头进行初始定位)
      isPositioned: false,
      countdown: 30,
      currentActionIndex: 0,
      completedDemonstrationVideos: 0,
      totalProgressPercentage: 0,
      isPaused: false, // Ensure not paused initially (确保初始未暂停)
    }, () => {
      this.startPositioningCheck();
    });
  },

  /**
   * Starts the initial user positioning check with countdown.
   * 开始用户初始定位检查并倒计时。
   */
  startPositioningCheck() {
    this.clearAllTimers(); // Clear any existing timers (清除任何现有计时器)

    // Start countdown timer (启动倒计时计时器)
    this.data.countdownTimer = setInterval(() => {
      let newCountdown = this.data.countdown - 1;
      this.setData({
        countdown: newCountdown
      });
      if (newCountdown <= 0) {
        clearInterval(this.data.countdownTimer);
        this.data.countdownTimer = null;
        this.returnToInitialStage('定位超时，请重新尝试。');
      }
    }, 1000);

    // Start continuous camera monitoring for positioning (开始持续摄像头监控以进行定位)
    this.startCameraMonitoring(this.sendFrameToBackendForPositioning, 500);
  },

  /**
   * Generic function to start camera monitoring with a specified callback and interval.
   * @param {Function} callback - The function to call with the captured image path. (捕获图像路径后调用的函数)
   * @param {number} interval - The interval in milliseconds to capture frames. (捕获帧的间隔，单位毫秒)
   * 启动摄像头监控的通用函数，带有指定的 callback 和 interval。
   */
  startCameraMonitoring(callback, interval) {
    if (this.data.cameraMonitoringInterval) {
      clearInterval(this.data.cameraMonitoringInterval);
    }
    this.data.cameraMonitoringInterval = setInterval(() => {
      if (!this.data.cameraContext) {
        console.warn('Camera context not available for monitoring.');
        return;
      }
      this.data.cameraContext.takePhoto({
        quality: 'low', // Low quality for quicker processing (低质量，以便更快处理)
        success: (res) => {
          callback(res.tempImagePath);
        },
        fail: (err) => {
          console.error('Camera takePhoto failed during monitoring:', err);
          // Consider more robust error handling here, e.g., prompt user to check permissions (在此处考虑更健壮的错误处理，例如提示用户检查权限)
        }
      });
    }, interval);
  },

  /**
   * Stops continuous camera monitoring.
   * 停止持续摄像头监控。
   */
  stopCameraMonitoring() {
    if (this.data.cameraMonitoringInterval) {
      clearInterval(this.data.cameraMonitoringInterval);
      this.data.cameraMonitoringInterval = null;
      console.log('Camera monitoring stopped.');
    }
  },

  /**
   * Sends a single frame to the backend for initial upper body positioning check.
   * @param {string} imagePath - Temporary file path of the captured image. (捕获图像的临时文件路径)
   * 将单帧发送到后端进行初始上半身定位检查。
   */
  sendFrameToBackendForPositioning(imagePath) {
    if (!imagePath) {
      console.error('Image path is empty, cannot send for positioning.');
      return;
    }

    wx.uploadFile({
      url: `${this.data.backendBaseUrl}/detect_upper_body`,
      filePath: imagePath,
      name: 'image',
      success: (res) => {
        const data = JSON.parse(res.data);
        if (data && data.is_upper_body_in_frame) {
          if (!this.data.isPositioned) { // Only call if state changes (仅在状态改变时调用)
            this.onUserPositioned();
          }
        } else {
          // console.log('Backend: User upper body not in frame.');
        }
      },
      fail: (err) => {
        console.error('Upload image for positioning failed:', err);
        wx.showToast({
          title: '网络或服务器错误，请重试',
          icon: 'none',
          duration: 2000
        });
        this.returnToInitialStage('网络或服务器错误，请检查。'); // Critical error, return to start (严重错误，返回开始界面)
      }
    });
  },

  /**
   * Called when the user's upper body is successfully detected in the frame.
   * Transitions from positioning to video playback.
   * 当用户的上半身在画面中成功检测到时调用。
   * 从定位过渡到视频播放。
   */
  onUserPositioned() {
    this.clearAllTimers(); // Stop positioning countdown and camera monitoring (停止定位倒计时和摄像头监控)
    this.setData({
      isPositioned: true,
      isCameraVisibleForUser: false, // Hide camera feed from user view (从用户视图中隐藏摄像头画面)
    }, () => {
      // Initialize video context after video component is rendered (视频组件渲染后初始化视频上下文)
      this.data.videoPlayer = wx.createVideoContext('exerciseVideo');
      this.playNextVideo();
      // Start continuous camera monitoring for in-training checks (mocked for now) (开始训练中的持续摄像头监控检查（目前是模拟的）)
      this.startCameraMonitoring(this.sendFrameToBackendForContinuousCheck, 1000); // Check every 1 second (每1秒检查一次)
    });
  },

  /**
   * Sends a single frame to the backend for continuous upper body check during training.
   * This function now implements actual backend communication.
   * @param {string} imagePath - Temporary file path of the captured image. (捕获图像的临时文件路径)
   * 在训练期间将单帧发送到后端进行持续上半身检查。
   * 此功能现在实现实际的后端通信。
   */
  sendFrameToBackendForContinuousCheck(imagePath) {
    if (!imagePath) {
      console.error('图片路径为空，无法发送进行持续检测。');
      return;
    }

    // Only perform check if training is active and not paused
    // 仅在训练激活且未暂停时执行检查
    if (!this.data.isTrainingStarted || this.data.isPaused) {
      return;
    }

    wx.uploadFile({
      url: `${this.data.backendBaseUrl}/detect_upper_body`, // Same endpoint as initial positioning (与初始定位相同的端点)
      filePath: imagePath,
      name: 'image',
      success: (res) => {
        const data = JSON.parse(res.data);
        if (data && typeof data.is_upper_body_in_frame === 'boolean') {
          if (!data.is_upper_body_in_frame) {
            // User's upper body is no longer in frame, pause training and prompt repositioning
            // 用户上半身不再在画面中，暂停训练并提示重新定位
            console.warn('后端：用户上半身离开画面范围。暂停训练。');
            this.setData({
              isPositioned: false, // User is no longer positioned (用户不再定位)
              isCameraVisibleForUser: true, // Show camera again for repositioning (再次显示摄像头以重新定位)
              isPaused: true // Automatically pause training (自动暂停训练)
            });
            if (this.data.videoPlayer) this.data.videoPlayer.pause();
            this.stopCameraMonitoring(); // Stop current monitoring (停止当前监控)
            this.stopSpriteSheetCaptureAndSend(true); // Stop sprite sheet collection (停止雪碧图收集)
            this.startPositioningCheck(); // Restart positioning check (重新开始定位检查)
            wx.showToast({
              title: '请调整位置，训练已暂停',
              icon: 'none',
              duration: 3000
            });
          } else {
            // console.log('后端：用户上半身仍在画面中。'); // Keep logging minimal for continuous checks (持续检查时尽量减少日志记录)
          }
        } else {
          console.error('后端返回数据格式不正确 (持续检测):', data);
          // Non-critical error, but might indicate backend issue (非关键错误，但可能表示后端问题)
        }
      },
      fail: (err) => {
        console.error('上传图片到后端失败 (持续检测):', err);
        // Network or server error during continuous check (持续检查期间的网络或服务器错误)
        // Decide if this should pause training or just log (决定是否应暂停训练或仅记录)
        // For robustness, if it's a critical check, you might pause here too.
        // 为了健壮性，如果这是关键检查，您也可以在此处暂停。
        wx.showToast({ title: '网络或服务器错误，请重试', icon: 'none', duration: 1500 });
      }
    });
  },


  /**
   * Returns the user to the initial training start screen.
   * @param {string} message - Message to display to the user. (向用户显示的消息)
   * 将用户返回到初始训练开始屏幕。
   */
  returnToInitialStage(message = '训练已返回初始界面。') {
    this.clearAllTimers();
    wx.showToast({
      title: message,
      icon: 'none',
      duration: 2000
    });
    this.setData({
      isTrainingStarted: false,
      isCameraVisibleForUser: false, // Ensure camera is hidden (确保摄像头隐藏)
      isPositioned: false,
      isPaused: false,
      currentVideoUrl: '',
      currentActionIndex: 0,
      totalProgressPercentage: 0,
      completedDemonstrationVideos: 0,
      videoPlayer: null, // Clear videoPlayer context (清除 videoPlayer 上下文)
      isCapturingAndSendingFrames: false, // Ensure frame capture is off (确保帧捕获已关闭)
    });
  },

  /**
   * Plays the next video in the action sequence.
   * 播放动作序列中的下一个视频。
   */
  playNextVideo() {
    if (this.data.currentActionIndex >= this.data.actionSequence.length) {
      console.log('所有视频已播放完毕。训练完成！');
      this.returnToInitialStage('恭喜您，训练已完成！');
      return;
    }

    const nextAction = this.data.actionSequence[this.data.currentActionIndex];

    // Determine if this video type requires sprite sheet capture (确定此视频类型是否需要雪碧图捕获)
    const shouldCaptureFrames = (nextAction.type === 'demonstration');

    this.setData({
      showLoading: false, // Show loading while video is buffering (视频缓冲时显示加载)
      currentVideoUrl: nextAction.url,
      currentActionName: nextAction.name,
      isCapturingAndSendingFrames: shouldCaptureFrames, // Update state (更新状态)
    }, () => {
      if (!this.data.videoPlayer) {
        this.data.videoPlayer = wx.createVideoContext('exerciseVideo');
        console.warn("videoPlayer was null, re-creating context.");
      }
      this.data.videoPlayer.play({
        success: () => console.log('Video play command issued.'),
        fail: (err) => {
          console.error('Video play command failed:', err);
          this.handleVideoLoadError(nextAction.url, '视频播放失败');
        }
      });

      // Manage sprite sheet capture and sending based on video type and pause status (根据视频类型和暂停状态管理雪碧图捕获和发送)
      if (this.data.isCapturingAndSendingFrames && !this.data.isPaused) {
        this.startSpriteSheetCaptureAndSend();
      } else {
        this.stopSpriteSheetCaptureAndSend(false); // Do not send remaining if not actively capturing (如果未主动捕获，则不发送剩余帧)
      }
    });
  },

  /**
   * Event handler for video waiting/buffering.
   * 视频等待/缓冲事件处理函数。
   */
  onVideoWaiting() {
    console.log('Video buffering...');
    this.setData({
      showLoading: false
    });
  },

  /**
   * Event handler for video starting to play.
   * 视频开始播放事件处理函数。
   */
  onVideoPlay() {
    console.log('Video started playing.');
    this.setData({
      showLoading: false
    });
  },

  /**
   * Event handler for video playback errors.
   * @param {Object} e - Event object. (事件对象)
   * 视频播放错误事件处理函数。
   */
  onVideoError(e) {
    console.error('Video playback error:', e.detail);
    const videoUrl = this.data.currentVideoUrl;
    let errorMessage = e.detail && e.detail.errMsg ? e.detail.errMsg : `错误码: ${e.detail && e.detail.errCode}`;
    this.handleVideoLoadError(videoUrl, `视频播放错误: ${errorMessage}`);
  },

  /**
   * Handles video loading/playback errors by showing a modal and returning to initial stage.
   * @param {string} videoUrl - The URL of the video that failed to load. (加载失败的视频URL)
   * @param {string} message - Custom error message. (自定义错误消息)
   * 通过显示模态框并返回初始阶段来处理视频加载/播放错误。
   */
  handleVideoLoadError(videoUrl, message = '视频加载失败') {
    this.setData({
      showLoading: false
    });
    wx.showModal({
      title: '视频加载失败',
      content: `${message}\n视频URL: ${videoUrl}\n请检查网络连接或服务器配置。`,
      showCancel: false,
      confirmText: '返回',
      success: () => {
        this.returnToInitialStage();
      }
    });
  },

  /**
   * Event handler for video ending.
   * Advances to the next video or finishes training.
   * 视频结束事件处理函数。
   * 推进到下一个视频或完成训练。
   */
  onVideoEnded() {
    console.log('Video ended.');
    this.stopSpriteSheetCaptureAndSend(true); // Stop and send any remaining frames (停止并发送任何剩余帧)

    const finishedAction = this.data.actionSequence[this.data.currentActionIndex];
    if (finishedAction && finishedAction.type === 'demonstration') {
      this.setData({
        completedDemonstrationVideos: this.data.completedDemonstrationVideos + 1
      });
    }

    this.setData({
      currentActionIndex: this.data.currentActionIndex + 1,
    });
    this.updateOverallProgress();
    this.playNextVideo();
  },

  /**
   * Event handler for video time updates.
   * Updates video progress and collects frames for sprite sheets if active.
   * @param {Object} e - Event object. (事件对象)
   * 视频时间更新事件处理函数。
   * 更新视频进度并在活动时收集雪碧图帧。
   */
  onVideoTimeUpdate(e) {
    const {
      currentTime,
      duration
    } = e.detail;
    if (duration > 0) {
      const currentVideoProgress = (currentTime / duration) * 100;
      this.setData({
        progress: currentVideoProgress
      });
    }
  },

  /**
   * Updates the overall training progress percentage.
   * 更新总训练进度百分比。
   */
  updateOverallProgress() {
    const overallProgress = (this.data.completedDemonstrationVideos / this.data.totalDemonstrationVideos) * 100;
    this.setData({
      totalProgressPercentage: overallProgress
    });
  },

  /**
   * Toggles the training pause state.
   * Pauses/resumes video, camera monitoring, and sprite sheet capture.
   * 切换训练暂停状态。
   * 暂停/恢复视频、摄像头监控和雪碧图捕获。
   */
  togglePause() {
    this.setData({
      isPaused: !this.data.isPaused
    }, () => {
      if (this.data.isPaused) {
        console.log('Training paused.');
        if (this.data.videoPlayer) this.data.videoPlayer.pause();
        this.stopCameraMonitoring(); // Stop continuous positioning checks (停止持续定位检查)
        this.stopSpriteSheetCaptureAndSend(true); // Stop and send any remaining frames (停止并发送任何剩余帧)
        this.setData({
          isCameraVisibleForUser: true // Show camera for repositioning if paused (如果暂停，显示摄像头以重新定位)
        });
      } else {
        console.log('Training resumed.');
        if (this.data.videoPlayer) this.data.videoPlayer.play();
        // Resume continuous camera monitoring (恢复持续摄像头监控)
        this.startCameraMonitoring(this.sendFrameToBackendForContinuousCheck, 1000);
        // Resume sprite sheet capture only if current video type requires it (仅当当前视频类型需要时才恢复雪碧图捕获)
        if (this.data.isCapturingAndSendingFrames) {
          this.startSpriteSheetCaptureAndSend();
        }
        this.setData({
          isCameraVisibleForUser: false // Hide camera after resuming (恢复后隐藏摄像头)
        });
      }
    });
  },

  /**
   * Prompts the user to confirm training termination and returns to the initial stage.
   * 提示用户确认训练终止并返回初始阶段。
   */
  terminateTraining() {
    wx.showModal({
      title: '终止训练',
      content: '确定要终止当前的锻炼吗？',
      success: (res) => {
        if (res.confirm) {
          this.returnToInitialStage('训练已终止。');
        }
      }
    });
  },

  /**
   * Starts capturing frames for sprite sheets and sending them to the backend.
   * Frames are captured at 6 FPS (every 166ms) and sent every second.
   * 开始捕获雪碧图帧并将其发送到后端。
   * 帧以 6 FPS（每 166 毫秒）捕获，并每秒发送一次。
   */
  startSpriteSheetCaptureAndSend() {
    if (this.data.spriteSheetSendingInterval) return; // Already running (已在运行)

    this.data.spriteFramesBuffer = []; // Clear buffer on start (启动时清除缓冲区)
    let frameCount = 0;
    const captureRate = 1000 / this.data.maxSpriteFrames; // ~166ms for 6 FPS (6 FPS 约 166 毫秒)

    this.data.spriteSheetSendingInterval = setInterval(() => {
      if (!this.data.cameraContext) {
        console.warn('Camera context not available for sprite sheet capture.');
        return;
      }

      this.data.cameraContext.takePhoto({
        quality: 'compressed', // Compressed quality for sprite sheets (雪碧图的压缩质量)
        success: (res) => {
          this.data.spriteFramesBuffer.push(res.tempImagePath);
        },
        fail: (err) => {
          console.error('Failed to collect frame for sprite sheet:', err);
        }
      });

      // Send accumulated frames every 1 second (after collecting maxSpriteFrames frames)
      // 每 1 秒发送累积帧（收集 maxSpriteFrames 帧后）
      if (++frameCount % this.data.maxSpriteFrames === 0) {
        this.processAndSendSpriteSheet();
      }
    }, captureRate);

    console.log('Sprite sheet capture and sending started.');
  },

  /**
   * Stops capturing and sending sprite sheets.
   * @param {boolean} sendRemaining - If true, sends any remaining frames in the buffer. (如果为 true，则发送缓冲区中任何剩余的帧)
   * 停止捕获和发送雪碧图。
   */
  stopSpriteSheetCaptureAndSend(sendRemaining = false) {
    if (this.data.spriteSheetSendingInterval) {
      clearInterval(this.data.spriteSheetSendingInterval);
      this.data.spriteSheetSendingInterval = null;
      console.log('Sprite sheet capture and sending stopped.');
    }
    if (sendRemaining && this.data.spriteFramesBuffer.length > 0) {
      console.log('Sending remaining buffered frames...');
      this.processAndSendSpriteSheet(true); // Force send (强制发送)
    }
    this.data.spriteFramesBuffer = []; // Always clear buffer on stop (停止时始终清除缓冲区)
  },

  /**
   * Processes the buffered frames into a sprite sheet and sends it to the backend.
   * @param {boolean} forceSend - If true, sends even if buffer is not full. (如果为 true，即使缓冲区未满也发送)
   * 将缓冲的帧处理成雪碧图并发送到后端。
   */
  processAndSendSpriteSheet(forceSend = false) {
    if (!forceSend && this.data.spriteFramesBuffer.length < this.data.maxSpriteFrames) {
      return; // Wait for buffer to fill if not forced (如果未强制，则等待缓冲区填满)
    }

    const framesToSend = this.data.spriteFramesBuffer.splice(0, this.data.maxSpriteFrames); // Take up to max frames (最多取 max 帧)
    if (framesToSend.length === 0) {
      // console.log('No frames to send for sprite sheet.'); // Avoid excessive logging (避免过度日志记录)
      return;
    }

    const currentAction = this.data.actionSequence[this.data.currentActionIndex];
    const actionCategory = currentAction ? currentAction.exerciseNumber : 'unknown';

    console.log(`Sending sprite sheet for action ${actionCategory} with ${framesToSend.length} frames.`);
    this.sendSpriteSheetToBackend(framesToSend, actionCategory);
  },

  /**
   * Sends an array of image paths (sprite sheet frames) to the backend.
   * Each image is sent as a separate part of a multipart form data request.
   * @param {string[]} spriteSheetImagePaths - Array of temporary file paths. (临时文件路径数组)
   * @param {string|number} actionCategory - The category of the action for the backend. (后端动作的类别)
   * 将图像路径数组（雪碧图帧）发送到后端。
   * 每个图像作为多部分表单数据请求的单独部分发送。
   */
  sendSpriteSheetToBackend(spriteSheetImagePaths, actionCategory) {
    if (spriteSheetImagePaths.length === 0) {
      return;
    }

    // Using Promise.allSettled to ensure all uploads are attempted (使用 Promise.allSettled 确保所有上传都已尝试)
    const uploadPromises = spriteSheetImagePaths.map((imagePath, index) => {
      return new Promise((resolve, reject) => {
        wx.uploadFile({
          url: `${this.data.backendBaseUrl}/upload_sprite_sheet`,
          filePath: imagePath,
          name: `frame_${index}`, // Unique name for each frame (每个帧的唯一名称)
          formData: {
            'actionCategory': actionCategory,
            'frameIndex': index.toString()
          },
          success: (res) => {
            if (res.statusCode === 200) {
              const data = JSON.parse(res.data);
              // console.log(`Frame ${index} uploaded successfully.`);
              resolve(data);
            } else {
              const data = JSON.parse(res.data);
              console.error(`Frame ${index} upload failed (status ${res.statusCode}):`, data);
              reject(new Error(`Server error for frame ${index}: ${data.message || 'Unknown error'}`));
            }
          },
          fail: (err) => {
            console.error(`Frame ${index} upload failed (network):`, err);
            reject(new Error(`Network error for frame ${index}: ${err.errMsg || 'Unknown error'}`));
          }
        });
      });
    });

    Promise.allSettled(uploadPromises)
      .then(results => {
        const failedUploads = results.filter(r => r.status === 'rejected');
        if (failedUploads.length > 0) {
          console.warn(`Some sprite sheet frames failed to upload:`, failedUploads);
          // Optionally, show a subtle toast or log for user/dev awareness (可选地，显示一个微妙的吐司或日志以供用户/开发人员了解)
        }
        // console.log('All sprite sheet frames processing attempted.');
      })
      .catch(error => {
        console.error('An unhandled error occurred during sprite sheet uploads:', error);
      });
  },

  /**
   * Event handler for camera errors (e.g., permission denied, camera occupied).
   * Guides the user to check permissions and returns to initial stage.
   * @param {Object} e - Event object. (事件对象)
   * 摄像头错误事件处理函数（例如，权限被拒绝，摄像头被占用）。
   * 指导用户检查权限并返回初始阶段。
   */
  onCameraError(e) {
    console.error('Camera error:', e.detail);
    wx.showModal({
      title: '摄像头异常',
      content: '无法访问摄像头，请检查权限设置或稍后重试。',
      showCancel: false,
      confirmText: '返回',
      success: (res) => {
        if (res.confirm) {
          this.returnToInitialStage();
        }
      }
    });
  },

  /**
   * Event handler for camera stopping unexpectedly.
   * 摄像头意外停止事件处理函数。
   */
  onCameraStop() {
    console.warn('Camera stopped unexpectedly.');
    // Potentially trigger a re-check or return to initial stage if critical (如果关键，可能会触发重新检查或返回初始阶段)
    if (this.data.isTrainingStarted && !this.data.isPaused && this.data.isPositioned) {
        // If training is active and camera stops, it's a critical issue (如果训练正在进行且摄像头停止，这是一个关键问题)
        wx.showToast({
            title: '摄像头已停止，训练中断',
            icon: 'none',
            duration: 2000
        });
        this.returnToInitialStage('摄像头异常中断。');
    }
  }
});
