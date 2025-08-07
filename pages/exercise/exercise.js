// pages/exercise/exercise.js

// Get the App instance to access global data (获取App实例以访问全局数据)
const app = getApp();

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
    cameraMonitoringInterval: null, // Interval for continuous camera monitoring (used for initial positioning and explanation videos) (持续摄像头监控的间隔，用于初始定位和讲解视频)
    cameraHeight: 300, // Dynamic height for camera view (摄像头视图的动态高度)
    userId: 1,

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
    spriteSheetCanvasWidth: 0, // Width for the hidden canvas used for stitching (用于拼接的隐藏canvas宽度)
    spriteSheetCanvasHeight: 0, // Height for the hidden canvas used for stitching (用于拼接的隐藏canvas高度)
    isSpriteCanvasDimensionsSet: false, // Flag to ensure canvas dimensions are set only once (确保canvas尺寸只设置一次的标志)

    // Backend Configuration (后端配置)
    backendBaseUrl: '', // Will be initialized from app.globalData (将从app.globalData初始化)
    currentRecoveryPlan: null, 

    // Upload state flags (上传状态标志)
    isUploadingPositioningFrame: false, // Flag to prevent multiple concurrent positioning uploads (防止多个并发定位上传的标志)
    isUploadingContinuousFrame: false, // Flag to prevent multiple concurrent continuous check uploads (防止多个并发持续检查上传的标志)
    isMonitoringPaused: false, // 新增状态，用于控制监测暂停
  },

  /**
   * Lifecycle function: onLoad
   * Initializes camera context and action sequence.
   * 生命周期函数：onLoad
   * 初始化摄像头上下文和动作序列。
   */
  onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    const cameraHeightValue = sysInfo.windowHeight * 0.7;
    
    this.setData({
      cameraHeight: cameraHeightValue,
      isTrainingStarted: false,
      backendBaseUrl: app.globalData.backendBaseUrl,
    });
  
    this.data.cameraContext = wx.createCameraContext();

    const userId = wx.getStorageSync('user_id');
    
    if (userId) {
      this.setData({
        userId: userId // Update data with the retrieved userId
      });
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
    
    // 获取康复计划信息
    this.fetchUserRecoveryPlan()
      .then(() => {
        // 初始化动作序列
        this.initializeActionSequence();
      })
      .catch(err => {
        console.error('获取康复计划失败:', err);
        wx.showToast({
          title: '获取康复计划失败',
          icon: 'none',
          duration: 2000
        });
        // 使用默认值初始化
        this.initializeActionSequence();
      });
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
    // IMPORTANT: cameraMonitoringInterval is now *only* for initial positioning or explanation videos.
    // Sprite sheet capture handles its own monitoring during demonstration.
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
    // Reset upload flags (重置上传标志)
    this.setData({
      isUploadingPositioningFrame: false,
      isUploadingContinuousFrame: false,
    });
  },

    /**
   * 获取用户的康复计划信息
   */
  fetchUserRecoveryPlan() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${this.data.backendBaseUrl}/api/user_recovery_plans/${this.data.userId}`,
        method: 'GET',
        success: (res) => {
          if (res.statusCode === 200 && res.data) {
            // 根据plan_name判断阶段
            let stage = res.data.plan_name; // 默认值
            
            const recoveryPlan = {
              ...res.data,
              stage: stage
            };
            
            this.setData({
              currentRecoveryPlan: recoveryPlan
            });
            app.globalData.currentRecoveryPlan = recoveryPlan; // 保存到全局
            resolve(recoveryPlan);
          } else {
            reject(new Error(res.data.message || '获取康复计划失败'));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  /**
   * Initializes the sequence of exercise actions (explanation and demonstration videos).
   * 初始化锻炼动作序列（讲解和演示视频）。
   */
  initializeActionSequence() {
    const sequence = [];
    let totalExercises = 5; // 默认值
    let demonstrationCount = 0;
  
    // 根据康复计划阶段确定视频数量
    if (this.data.currentRecoveryPlan) {
      if (this.data.currentRecoveryPlan.stage === 'stage_one') {
        totalExercises = 9;
      } else if (this.data.currentRecoveryPlan.stage === 'stage_two') {
        totalExercises = 15;
      }
    }
  
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
    // 确保有康复计划信息
    if (!this.data.currentRecoveryPlan) {
      wx.showToast({
        title: '请先获取康复计划信息',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    // 先创建恢复记录
    wx.request({
      url: `${this.data.backendBaseUrl}/api/recovery_records/start`,
      method: 'POST',
      data: {
        user_id: this.data.userId,
        plan_id: this.data.currentRecoveryPlan.plan_id // 使用当前康复计划的plan_id
      },
      success: (res) => {
        if (res.data && res.data.record_id) {
          this.setData({
            currentRecordId: res.data.record_id,
            isTrainingStarted: true,
            // ...其他设置
          }, () => {
            this.startPositioningCheck();
          });
        } else {
          wx.showToast({
            title: '创建训练记录失败',
            icon: 'none',
            duration: 2000
          });
        }
      },
      fail: (err) => {
        console.error('创建恢复记录失败:', err);
        wx.showToast({
          title: '网络错误，无法开始训练',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  /**
   * Starts the initial user positioning check with countdown.
   * 开始用户初始定位检查并倒计时。
   */
  startPositioningCheck() {
    this.clearAllTimers(); // Clear any existing timers (清除任何现有计时器)
    this.setData({
        isCameraVisibleForUser: true, // Make sure camera is visible during positioning
        countdown: 30 // Reset countdown
    });

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
    // This `cameraMonitoringInterval` is ONLY for initial positioning or explanation videos.
    this.startCameraMonitoring(this.sendFrameToBackendForPositioning, 500);
  },

  /**
   * Generic function to start camera monitoring with a specified callback and interval.
   * @param {Function} callback - The function to call with the captured image path. (捕获图像路径后调用的函数)
   * @param {number} interval - The interval in milliseconds to capture frames. (捕获帧的间隔，单位毫秒)
   * 启动摄像头监控的通用函数，带有指定的 callback 和 interval。
   */
  startCameraMonitoring(callback, interval) {
    // Ensure only one general camera monitoring interval is active
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
          // Add defensive check for res and res.tempImagePath
          // 添加对 res 和 res.tempImagePath 的防御性检查
          if (res && res.tempImagePath) {
            callback(res.tempImagePath);
          } else {
            console.error('takePhoto success but res or tempImagePath is missing:', res);
          }
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
   * This function also calculates and sets the sprite sheet canvas dimensions on the first successful frame.
   * @param {string} imagePath - Temporary file path of the captured image. (捕获图像的临时文件路径)
   * 将单帧发送到后端进行初始上半身定位检查。
   * 此函数还会在第一帧成功时计算并设置雪碧图Canvas的尺寸。
   */
  sendFrameToBackendForPositioning(imagePath) {
    if (!imagePath) {
      console.error('Image path is empty, cannot send for positioning.');
      return;
    }

    // Prevent multiple concurrent uploads for positioning (防止多个并发定位上传)
    if (this.data.isUploadingPositioningFrame) {
      console.log('Positioning frame upload already in progress, skipping.');
      return;
    }

    // Calculate sprite sheet canvas dimensions on the first frame if not already set
    // 如果尚未设置，则在第一帧上计算雪碧图Canvas尺寸
    if (!this.data.isSpriteCanvasDimensionsSet) {
      wx.getImageInfo({
        src: imagePath,
        success: (info) => {
          if (info && info.width && info.height) {
            const frameWidth = info.width;
            const frameHeight = info.height;
            const cols = 3; // For 2x3 grid (对于2x3网格)
            const rows = 2; // For 2x3 grid (对于2x3网格)
            const spriteSheetCanvasWidthValue = frameWidth * cols;
            const spriteSheetCanvasHeightValue = frameHeight * rows;

            this.setData({
              spriteSheetCanvasWidth: spriteSheetCanvasWidthValue,
              spriteSheetCanvasHeight: spriteSheetCanvasHeightValue,
              isSpriteCanvasDimensionsSet: true
            }, () => {
              // Dimensions set, now proceed with the actual upload (尺寸已设置，现在继续实际上传)
              this._performPositioningUpload(imagePath);
            });
          } else {
            console.error('getImageInfo success but width/height missing for positioning frame:', info);
            // Proceed with upload even if dimensions couldn't be accurately determined (即使无法准确确定尺寸，也继续上传)
            this._performPositioningUpload(imagePath); 
          }
        },
        fail: (err) => {
          console.error('getImageInfo failed for positioning frame:', err);
          // Proceed with upload even if image info couldn't be retrieved (即使无法检索图像信息，也继续上传)
          this._performPositioningUpload(imagePath); 
        }
      });
    } else {
      // Dimensions already set, just proceed with upload (尺寸已设置，直接继续上传)
      this._performPositioningUpload(imagePath);
    }
  },

  /**
   * Private helper function to perform the actual positioning frame upload.
   * This is called after sprite sheet canvas dimensions are potentially set.
   * 执行实际定位帧上传的私有辅助函数。
   * 这在雪碧图Canvas尺寸可能已设置后调用。
   * @param {string} imagePath - Temporary file path of the captured image. (捕获图像的临时文件路径)
   */
  _performPositioningUpload(imagePath) {
    this.setData({ isUploadingPositioningFrame: true });

    wx.uploadFile({
      url: `${this.data.backendBaseUrl}/detect_upper_body`,
      filePath: imagePath,
      name: 'image',
      success: (res) => {
        // Add defensive check for res and res.data
        // 添加对 res 和 res.data 的防御性检查
        if (res && res.data) {
          const data = JSON.parse(res.data); // Flask 返回的是 JSON 字符串，需要解析
          console.log('后端检测结果:', data);

          if (data && typeof data.is_upper_body_in_frame === 'boolean') {
            if (data.is_upper_body_in_frame) {
              console.log('后端确认用户上半身在画面中。');
              if (!this.data.isPositioned) { // Only call if state changes (仅在状态改变时调用)
                  this.onUserPositioned();
              }
            } else {
              console.log('后端：用户上半身不在画面中。');
            }
          } else {
            console.error('后端返回数据格式不正确:', data);
            wx.showToast({
              title: '后端服务异常，请稍后再试',
              icon: 'none',
              duration: 2000
            });
          }
        } else {
          console.error('wx.uploadFile success but res or res.data is missing:', res);
          wx.showToast({
            title: '上传失败，后端无响应',
            icon: 'none',
            duration: 2000
          });
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
      },
      complete: () => {
        // Ensure the flag is reset regardless of success or failure (无论成功或失败，确保标志被重置)
        this.setData({ isUploadingPositioningFrame: false });
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
      isPaused: false,
    }, () => {
      // Initialize video context after video component is rendered (视频组件渲染后初始化视频上下文)
      // this.data.videoPlayer = wx.createVideoContext('exerciseVideo');
      
      // 新增：检查 videoPlayer 是否已存在，避免在重新定位时重复创建
      if (!this.data.videoPlayer) {
        this.data.videoPlayer = wx.createVideoContext('exerciseVideo');
      }
      this.playNextVideo();
      // At this point, no general camera monitoring should be active.
      // playNextVideo will decide what monitoring to start based on video type.
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
    if (!this.data.isTrainingStarted || this.data.isPaused || this.data.isMonitoringPaused) {
      return;
    }

    // Prevent multiple concurrent uploads for continuous check (防止多个并发持续检查上传)
    if (this.data.isUploadingContinuousFrame) {
      console.log('Continuous frame upload already in progress, skipping.');
      return;
    }

    this.setData({ isUploadingContinuousFrame: true });

    wx.uploadFile({
      url: `${this.data.backendBaseUrl}/detect_upper_body`, // Same endpoint as initial positioning (与初始定位相同的端点)
      filePath: imagePath,
      name: 'image',
      success: (res) => {
        // Add defensive check for res and res.data
        // 添加对 res 和 res.data 的防御性检查
        if (res && res.data) {
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
              this.stopCameraMonitoring(); // Stop current general monitoring
              this.stopSpriteSheetCaptureAndSend(true); // Stop and send any remaining frames (stops sprite sheet related camera calls)
              this.startPositioningCheck(); // Restart positioning check (这将重新启动cameraMonitoringInterval for positioning)
              wx.showToast({
                title: '请调整位置，训练已暂停',
                icon: 'none',
                duration: 3000
              });
            } else {
              // User is in frame. Check if training was paused due to being out of frame.
              // 用户在画面中。检查训练是否因离开画面而暂停。
              if (!this.data.isPositioned && this.data.isPaused) {
                  console.log('后端：用户已回到画面中。自动恢复训练。');
                  this.clearAllTimers(); // Clear positioning countdown and any current monitoring (包括 sprite sheet interval if it was running)
                  this.setData({
                      isPositioned: true,
                      isCameraVisibleForUser: false, // Hide camera (隐藏摄像头)
                      isPaused: false // Unpause (取消暂停)
                  }, () => {
                      if (this.data.videoPlayer) this.data.videoPlayer.play();
                      // Re-evaluate and restart the correct monitoring based on current video type
                      // 根据当前视频类型重新评估并重新启动正确的监控
                      const currentAction = this.data.actionSequence[this.data.currentActionIndex];
                      if (currentAction && currentAction.type === 'demonstration') {
                          this.startSpriteSheetCaptureAndSend(); // This will handle the camera calls
                      } else {
                          // If not a demonstration video, restart general camera monitoring
                          this.startCameraMonitoring(this.sendFrameToBackendForContinuousCheck, 1000);
                      }
                  });
                  wx.showToast({
                      title: '位置已调整，训练已恢复',
                      icon: 'success',
                      duration: 1500
                  });
              }
            }
          } else {
            console.error('后端返回数据格式不正确 (持续检测):', data);
            // Non-critical error, but might indicate backend issue (非关键错误，但可能表示后端问题)
          }
        } else {
          console.error('wx.uploadFile success but res or res.data is missing (continuous check):', res);
        }
      },
      fail: (err) => {
        console.error('上传图片到后端失败 (持续检测):', err);
        // Network or server error during continuous check (持续检查期间的网络或服务器错误)
        // Decide if this should pause training or just log (决定是否应暂停训练或仅记录)
        // For robustness, if it's a critical check, you might pause here too.
        // 为了健壮性，如果这是关键检查，您也可以在此处暂停。
        // wx.showToast({ title: '网络或服务器错误，请重试', icon: 'none', duration: 1500 });
      },
      complete: () => {
        // Ensure the flag is reset regardless of success or failure (无论成功或失败，确保标志被重置)
        this.setData({ isUploadingContinuousFrame: false });
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
      currentRecordId: null, // 重置记录ID
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
      isSpriteCanvasDimensionsSet: false, // Reset canvas dimensions flag (重置canvas尺寸标志)
      spriteSheetCanvasWidth: 0, // Reset canvas dimensions (重置canvas尺寸)
      spriteSheetCanvasHeight: 0, // Reset canvas dimensions (重置canvas尺寸)
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
      // Only play video if not currently paused (auto-resume handled elsewhere)
      if (!this.data.isPaused) {
        this.data.videoPlayer.play({
          success: () => {
            console.log('Video play command issued.');
          },
          fail: (err) => {
            console.error('Video play command failed:', err);
            this.handleVideoLoadError(nextAction.url, '视频播放失败');
          }
        });
      }

      // *** MODIFIED LOGIC HERE TO AVOID CONFLICTING CAMERA CALLS ***
      // Manage camera monitoring and sprite sheet capture based on video type and pause status
      if (shouldCaptureFrames && !this.data.isPaused) {
        // If it's a demonstration video and not paused, start sprite sheet capture.
        // Sprite sheet capture will internally handle continuous positioning checks.
        this.stopCameraMonitoring(); // Ensure any general monitoring is stopped.
        this.startSpriteSheetCaptureAndSend();
      } else {
        // If it's an explanation video or paused, stop sprite sheet capture.
        this.stopSpriteSheetCaptureAndSend(false); 
        // Only start general camera monitoring if not paused (for explanation videos).
        if (!this.data.isPaused) {
          this.startCameraMonitoring(this.sendFrameToBackendForContinuousCheck, 1000);
        } else {
          // If paused, ensure all camera monitoring is off.
          this.stopCameraMonitoring();
        }
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
   */
  onVideoEnded() {
    console.log('Video ended.');
    this.stopSpriteSheetCaptureAndSend(true); // Stop and send any remaining frames (停止并发送任何剩余帧)
    this.stopCameraMonitoring(); // Ensure general monitoring is stopped (确保通用监控已停止)

    const finishedAction = this.data.actionSequence[this.data.currentActionIndex];
    if (finishedAction && finishedAction.type === 'demonstration') {
        // Only increment completed demonstration videos if the just-finished video was a 'demonstration' type
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
        this.stopCameraMonitoring(); // Stop any active general monitoring
        this.stopSpriteSheetCaptureAndSend(true); // Stop and send any remaining frames (stops sprite sheet camera calls)
        this.setData({
          isCameraVisibleForUser: true // Show camera for repositioning if paused
        });
      } else {
        console.log('Training resumed.');
        if (this.data.videoPlayer) this.data.videoPlayer.play();
        
        // 设置2秒的延迟，在这段时间内不进行上半身监测
        this.setData({
          isMonitoringPaused: true // 新增一个状态标志，表示监测暂停
        });
        
        setTimeout(() => {
          this.setData({
            isMonitoringPaused: false // 2秒后恢复监测
          });
          
          // Resume camera monitoring/sprite sheet capture based on video type
          const currentAction = this.data.actionSequence[this.data.currentActionIndex];
          if (currentAction && currentAction.type === 'demonstration') {
            // If it's a demonstration video, restart sprite sheet capture.
            // This will handle the continuous check via its own frame capture.
            this.stopCameraMonitoring(); // Ensure general monitoring is OFF.
            this.startSpriteSheetCaptureAndSend();
          } else {
            // If not a demonstration video, restart general camera monitoring.
            this.startCameraMonitoring(this.sendFrameToBackendForContinuousCheck, 1000);
            this.stopSpriteSheetCaptureAndSend(false); // Ensure sprite sheet capture is OFF.
          }
        }, 2000); // 2秒延迟
        
        this.setData({
          isCameraVisibleForUser: false // Hide camera after resuming
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
   * Skips the current action (both explanation and demonstration videos for the current exercise number).
   * 跳过当前动作（包括当前练习编号的讲解和演示视频）。
   */
  skipCurrentAction() {
    wx.showModal({
      title: '跳过动作',
      content: '确定要跳过当前动作吗？这将跳过本动作的讲解和演示。',
      success: (res) => {
        if (res.confirm) {
          const currentAction = this.data.actionSequence[this.data.currentActionIndex];
          if (!currentAction) {
            console.warn('No current action to skip.');
            this.returnToInitialStage('没有更多动作可跳过。');
            return;
          }

          const currentExerciseNumber = currentAction.exerciseNumber;
          let nextActionIndex = -1;

          // Find the index of the first action that belongs to a different exercise number
          // 找到属于不同练习编号的第一个动作的索引
          for (let i = this.data.currentActionIndex + 1; i < this.data.actionSequence.length; i++) {
            if (this.data.actionSequence[i].exerciseNumber !== currentExerciseNumber) {
              nextActionIndex = i;
              break;
            }
          }

          // If no next exercise is found, it means we are skipping the last exercise
          // 如果没有找到下一个练习，则表示我们正在跳过最后一个练习
          if (nextActionIndex === -1) {
            nextActionIndex = this.data.actionSequence.length; // Set to end of sequence (设置为序列末尾)
          }

          // Increment completed demonstration videos for the skipped exercise
          // Only increment if the current action was a demonstration, or if the next action is beyond the current exercise's demonstration.
          if (currentAction.type === 'demonstration' || (nextActionIndex > this.data.currentActionIndex && this.data.actionSequence[nextActionIndex -1].type === 'demonstration')) {
             this.setData({
                 completedDemonstrationVideos: this.data.completedDemonstrationVideos + 1
             });
          }

          this.setData({
            currentActionIndex: nextActionIndex, // Set to the start of the next exercise (设置为下一个练习的开始)
          }, () => {
            // Ensure video is paused and camera monitoring/sprite sheet sending stops before skipping
            if (this.data.videoPlayer) this.data.videoPlayer.pause();
            this.stopCameraMonitoring(); // Stop any general monitoring
            this.stopSpriteSheetCaptureAndSend(true); // Stop and send any remaining frames (stops sprite sheet camera calls)

            this.updateOverallProgress(); // Update progress bar (更新进度条)
            this.playNextVideo(); // Play the next video (播放下一个视频)
          });
        }
      }
    });
  },

  /**
   * Starts capturing frames for sprite sheets and sending them to the backend.
   * Frames are captured at 6 FPS (every 166ms) and sent every second.
   * This function is now the *sole* source of camera `takePhoto` calls during demonstration videos.
   * 开始捕获雪碧图帧并将其发送到后端。
   * 帧以 6 FPS（每 166 毫秒）捕获，并每秒发送一次。
   * 此函数现在是演示视频期间摄像头 `takePhoto` 调用的*唯一*来源。
   */
  startSpriteSheetCaptureAndSend() {
    if (this.data.spriteSheetSendingInterval) return; // Already running (已在运行)

    this.data.spriteFramesBuffer = []; // Clear buffer on start (启动时清除缓冲区)
    let frameCount = 0;
    const captureRate = 1000 / this.data.maxSpriteFrames; // ~166ms for 6 FPS (6 FPS 约 166 毫秒)

    // IMPORTANT: This interval now handles *all* camera captures during demonstration videos.
    this.data.spriteSheetSendingInterval = setInterval(() => {
      if (!this.data.cameraContext) {
        console.warn('Camera context not available for sprite sheet capture.');
        return;
      }

      this.data.cameraContext.takePhoto({
        quality: 'compressed', // Compressed quality for sprite sheets (雪碧图的压缩质量)
        success: (res) => {
          if (res && res.tempImagePath) {
            this.data.spriteFramesBuffer.push(res.tempImagePath);
          } else {
            console.error('Failed to collect frame for sprite sheet: res or tempImagePath missing', res);
          }
        },
        fail: (err) => {
          console.error('Failed to collect frame for sprite sheet:', err);
        }
      });

      // Send accumulated frames every 1 second (after collecting maxSpriteFrames frames)
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
   * Also uses one of the captured frames for continuous upper body check.
   * @param {boolean} forceSend - If true, sends even if buffer is not full. (如果为 true，即使缓冲区未满也发送)
   * 将缓冲的帧处理成雪碧图并发送到后端。
   * 同时使用捕获的其中一帧进行持续上半身检查。
   */
  processAndSendSpriteSheet(forceSend = false) {
    if (!forceSend && this.data.spriteFramesBuffer.length < this.data.maxSpriteFrames) {
      return; // Wait for buffer to fill if not forced (如果未强制，则等待缓冲区填满)
    }

    // Use splice to remove frames from buffer for processing
    const framesToSend = this.data.spriteFramesBuffer.splice(0, this.data.maxSpriteFrames); 
    if (framesToSend.length === 0) {
      return;
    }

    const currentAction = this.data.actionSequence[this.data.currentActionIndex];
    const actionCategory = currentAction ? currentAction.exerciseNumber : 'unknown';

    console.log(`Sending sprite sheet for action ${actionCategory} with ${framesToSend.length} frames.`);
    this.sendSpriteSheetToBackend(framesToSend, actionCategory);

    // *** FUSING MONITORING HERE ***
    // Reuse the first captured frame from the current batch for the continuous upper body check.
    // This ensures only one 'takePhoto' operation is happening, driven by the sprite sheet capture.
    if (framesToSend.length > 0) {
        this.sendFrameToBackendForContinuousCheck(framesToSend[0]); 
    }
  },

  /**
   * Sends an array of image paths (sprite sheet frames) to the backend by stitching them into one image.
   * @param {string[]} spriteSheetImagePaths - Array of temporary file paths for individual frames. (单个帧的临时文件路径数组)
   * @param {string|number} actionCategory - The category of the action for the backend. (后端动作的类别)
   * 通过将图像路径数组（雪碧图帧）拼接成一张图片来发送到后端。
   */
  sendSpriteSheetToBackend(spriteSheetImagePaths, actionCategory) {
    if (spriteSheetImagePaths.length === 0) {
      return;
    }

    const { spriteSheetCanvasWidth, spriteSheetCanvasHeight, maxSpriteFrames } = this.data;
    const cols = 3; // For 2x3 grid (对于2x3网格)
    const rows = 2; // For 2x3 grid (对于2x3网格)
    
    // Ensure canvas dimensions are set before proceeding (确保canvas尺寸在继续之前已设置)
    if (spriteSheetCanvasWidth === 0 || spriteSheetCanvasHeight === 0) {
        console.error('Sprite sheet canvas dimensions not set. Skipping stitching and upload.');
        wx.showToast({ title: '雪碧图Canvas尺寸未设置', icon: 'none', duration: 2000 });
        return;
    }

    const frameWidth = spriteSheetCanvasWidth / cols;
    const frameHeight = spriteSheetCanvasHeight / rows;

    // Get canvas context for drawing (获取用于绘制的canvas上下文)
    const query = wx.createSelectorQuery();
    query.select('#spriteSheetCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          console.error('Failed to get canvas node for sprite sheet stitching.');
          wx.showToast({ title: 'Canvas初始化失败', icon: 'none', duration: 2000 });
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');

        // Set canvas dimensions (设置canvas尺寸)
        canvas.width = spriteSheetCanvasWidth;
        canvas.height = spriteSheetCanvasHeight;

        // Clear canvas (清空canvas)
        ctx.clearRect(0, 0, spriteSheetCanvasWidth, spriteSheetCanvasHeight);

        let loadedImagesCount = 0;
        const imagesToLoad = spriteSheetImagePaths.length;

        // If no images to load, just return (如果没有图片要加载，直接返回)
        if (imagesToLoad === 0) {
            console.warn('No images to stitch for sprite sheet.');
            return;
        }

        const checkAllImagesLoadedAndDraw = () => {
          loadedImagesCount++;
          if (loadedImagesCount === imagesToLoad) {
            // All images loaded and drawn, now export and upload (所有图片加载并绘制完成，现在导出并上传)
            wx.canvasToTempFilePath({
              canvas: canvas, // Use the canvas node (使用canvas节点)
              x: 0,
              y: 0,
              width: spriteSheetCanvasWidth,
              height: spriteSheetCanvasHeight,
              destWidth: spriteSheetCanvasWidth*0.3,
              destHeight: spriteSheetCanvasHeight*0.3,
              quality: 0.4, // Compress the final sprite sheet (0-1, default 1) (压缩最终的雪碧图，0-1，默认1)
              fileType: 'jpeg', // Choose file type (选择文件类型)
              success: (res) => {
                const spriteSheetPath = res.tempFilePath;
                console.log(`Generated sprite sheet: ${spriteSheetPath}`);
                this.uploadSingleSpriteSheet(spriteSheetPath, actionCategory, imagesToLoad);
              },
              fail: (err) => {
                console.error('Failed to generate sprite sheet:', err);
                wx.showToast({ title: '生成雪碧图失败', icon: 'none', duration: 2000 });
              }
            });
          }
        };

        spriteSheetImagePaths.forEach((imagePath, index) => {
          const img = canvas.createImage();
          img.onload = () => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            ctx.drawImage(img, col * frameWidth, row * frameHeight, frameWidth, frameHeight);
            checkAllImagesLoadedAndDraw();
          };
          img.onerror = (err) => {
            console.error(`Failed to load image for sprite sheet: ${imagePath}`, err);
            // Even if an image fails to load, try to proceed with others (即使图片加载失败，也尝试继续处理其他图片)
            checkAllImagesLoadedAndDraw(); 
          };
          img.src = imagePath;
        });
      });
  },

  /**
   * Uploads a single stitched sprite sheet image to the backend.
   * @param {string} spriteSheetPath - Temporary file path of the stitched sprite sheet. (拼接雪碧图的临时文件路径)
   * @param {string|number} actionCategory - The category of the action for the backend. (后端动作的类别)
   * @param {number} frameCount - The number of individual frames stitched into this sheet. (拼接成此雪碧图的单个帧数)
   * 将单个拼接的雪碧图上传到后端。
   */
  uploadSingleSpriteSheet(spriteSheetPath, actionCategory, frameCount) {
    wx.uploadFile({
      url: `${this.data.backendBaseUrl}/upload_sprite_sheet`,
      filePath: spriteSheetPath,
      name: 'sprite_sheet',
      formData: {
          'actionCategory': actionCategory,
          'frame_count': frameCount.toString(),
          'record_id': this.data.currentRecordId // 添加当前记录ID
      },
      success: (res) => {
        if (res.statusCode === 200) {
          if (res && res.data) {
            const data = JSON.parse(res.data);
            console.log('Sprite sheet uploaded successfully:', data.message);
          } else {
            console.error('Sprite sheet upload success but res or res.data is missing:', res);
          }
        } else {
          const data = res.data ? JSON.parse(res.data) : { message: 'Unknown error' };
          console.error(`Sprite sheet upload failed with status ${res.statusCode}:`, data);
          wx.showToast({ title: `雪碧图上传失败: ${data.message || '未知错误'}`, icon: 'none', duration: 2000 });
        }
      },
      fail: (err) => {
        console.error('Sprite sheet upload failed (network):', err);
        wx.showToast({ title: '网络错误，雪碧图上传失败', icon: 'none', duration: 2000 });
      }
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
    if (this.data.isTrainingStarted && !this.data.isPaused && this.data.isPositioned) {
        wx.showToast({
            title: '摄像头已停止，训练中断',
            icon: 'none',
            duration: 2000
        });
        this.returnToInitialStage('摄像头异常中断。');
    }
  },

  handleHome: function() {
    wx.navigateTo({
      url: '/pages/home/home' // 假设记录页面的路径
    });
  },
});