// pages/exercise/exercise.js

// Get the App instance to access global data (获取App实例以访问全局数据)
const app = getApp();

Page({
  data: {
    // UI State (UI状态)
    isTrainingStarted: false,
    isCameraVisibleForUser: false,
    isPositioned: false,
    isPaused: false,
    showLoading: false,

    // Camera related (摄像头相关)
    cameraContext: null,
    countdown: 30,
    countdownTimer: null,
    cameraMonitoringInterval: null,
    cameraHeight: 300,
    userId: 1,

    // CameraFrameListener 相关状态
    cameraListener: null, // 帧监听器实例
    lastFrameTime: 0, // 用于帧率控制（节流）
    isCapturingAndSendingFrames: false, // 标志位，控制是否处理帧数据

    // Video related (视频相关)
    videoPlayer: null,
    currentVideoUrl: '',
    currentActionIndex: 0,
    actionSequence: [],
    currentActionName: '',
    currentVideoProgress: 0, // 【新增】用于显示当前视频进度

    // Progress tracking (进度跟踪)
    totalDemonstrationVideos: 0,
    completedDemonstrationVideos: 0,
    totalProgressPercentage: 0,

    // Sprite Sheet related (雪碧图相关)
    spriteFramesBuffer: [],
    maxSpriteFrames: 6,

    // 用于处理单帧数据的隐藏canvas尺寸和节点
    frameCanvasNode: null, // 【新增】存储canvas节点
    frameCanvasContext: null,
    isCanvasReady: false,
    frameCanvasWidth: 360,
    frameCanvasHeight: 640,
    isFrameCanvasSizeSet: false,

    // 用于拼接雪碧图的canvas尺寸
    spriteSheetCanvasWidth: 0,
    spriteSheetCanvasHeight: 0,
    isSpriteCanvasDimensionsSet: false,

    // Backend Configuration (后端配置)
    backendBaseUrl: '',
    currentRecoveryPlan: null,

    // Upload state flags (上传状态标志)
    isUploadingPositioningFrame: false,
    isUploadingContinuousFrame: false,
    isMonitoringPaused: false,

    audioContext: null, // 【新增】用于存储音频播放实例
  },

  /**
   * 生命周期函数：onLoad
   */
  onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    this.setData({
      cameraHeight: sysInfo.windowHeight * 0.7,
      isTrainingStarted: false,
      backendBaseUrl: app.globalData.backendBaseUrl,
    });

    // 创建CameraContext，注意这里不传递组件ID
    this.data.cameraContext = wx.createCameraContext();

    // 初始化引导音频
    this.initAudioPlayerWithCaching();

    // 初始化相机帧监听器
    this.initCameraListener();

    const userId = wx.getStorageSync('user_id');
    if (userId) {
      this.setData({ userId: userId });
    } else {
      wx.showToast({ title: '未找到用户ID，请重新登录', icon: 'none', duration: 2000 });
    }
    this.fetchUserRecoveryPlan()
      .then(() => { this.initializeActionSequence(); })
      .catch(err => {
        console.error('获取康复计划失败:', err);
        this.initializeActionSequence();
      });
  },

  /**
   * 生命周期函数：onReady
   * 确保wxml渲染完毕后再执行一些操作
   */
  onReady() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#frameCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res && res[0] && res[0].node) {
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d'); // 注意这里应该是 '2d' 而不是 'd'
          
          // 设置 Canvas 尺寸
          canvas.width = this.data.frameCanvasWidth;
          canvas.height = this.data.frameCanvasHeight;
          
          // 将获取到的节点和上下文存储起来
          this.setData({
            frameCanvasNode: canvas,
            frameCanvasContext: ctx,
            isCanvasReady: true,
            isFrameCanvasSizeSet: true // 这里也设置为 true
          });
          console.log('Frame canvas node and context are ready.');
  
        } else {
          console.error('获取 frameCanvas 节点失败，后续帧处理将无法进行。');
        }
      });
  },

  /**
   * 生命周期函数：onUnload
   */
  onUnload() {
    this.clearAllTimers();
    if (this.data.audioContext) {
      this.data.audioContext.destroy();
    }
  },

  /**
   * 初始化音频播放器，并处理缓存逻辑
   */
  initAudioPlayerWithCaching() {
    const AUDIO_URL = `${this.data.backendBaseUrl}/static/audios/upper_guidance.mp3`;
    const STORAGE_KEY = 'cached_audio_path'; // 用于本地存储的 key
    const fs = wx.getFileSystemManager();
    const audioCtx = wx.createInnerAudioContext();
    audioCtx.loop = false;

    // 1. 尝试从本地存储中获取缓存路径
    wx.getStorage({
      key: STORAGE_KEY,
      success: (res) => {
        const savedPath = res.data;
        // 2. 检查文件是否真实存在
        fs.access({
          path: savedPath,
          success: () => {
            // 文件存在，直接使用缓存
            console.log('使用已缓存的音频文件:', savedPath);
            audioCtx.src = savedPath;
            this.setData({ audioContext: audioCtx });
          },
          fail: () => {
            // 文件不存在（可能被清理），重新下载
            console.warn('缓存文件已失效，重新下载。');
            this.downloadAndCacheAudio(AUDIO_URL, STORAGE_KEY, audioCtx, fs);
          }
        });
      },
      fail: () => {
        // 缓存中没有路径，直接下载
        console.log('未找到音频缓存，开始下载。');
        this.downloadAndCacheAudio(AUDIO_URL, STORAGE_KEY, audioCtx, fs);
      }
    });
  },

  /**
   * 下载并缓存音频文件的辅助函数
   */
  downloadAndCacheAudio(url, storageKey, audioCtx, fs) {
    wx.downloadFile({
      url: url,
      success: (res) => {
        if (res.statusCode === 200) {
          // 3. 将下载的临时文件保存为永久文件
          fs.saveFile({
            tempFilePath: res.tempFilePath,
            success: (saveRes) => {
              const permanentPath = saveRes.savedFilePath;
              console.log('音频下载并缓存成功:', permanentPath);
              // 4. 更新缓存并设置播放源
              wx.setStorage({ key: storageKey, data: permanentPath });
              audioCtx.src = permanentPath;
              this.setData({ audioContext: audioCtx });
            },
            fail: (err) => console.error('保存音频文件失败:', err)
          });
        } else {
          console.error('下载音频文件失败, 服务器状态码:', res.statusCode);
        }
      },
      fail: (err) => console.error('下载音频文件网络错误:', err)
    });
  },

  /**
   * 初始化相机帧数据监听器
   */
  initCameraListener() {
    if (!this.data.cameraContext) {
      console.error("CameraContext not ready, cannot init listener.");
      return;
    }
    this.data.cameraListener = this.data.cameraContext.onCameraFrame((frame) => {
      this.handleCameraFrame(frame);
    });
    console.log("Camera frame listener initialized.");
  },

  /**
   * 清除所有定时器和监听器
   */
  clearAllTimers() {
    if (this.data.audioContext) {
      this.data.audioContext.stop();
    }
    if (this.data.countdownTimer) {
      clearInterval(this.data.countdownTimer);
      this.data.countdownTimer = null;
    }
    if (this.data.cameraMonitoringInterval) {
      clearInterval(this.data.cameraMonitoringInterval);
      this.data.cameraMonitoringInterval = null;
    }
    if (this.data.isCapturingAndSendingFrames) {
      this.stopSpriteSheetCaptureAndSend(false);
    }
    this.data.spriteFramesBuffer = [];
    this.setData({
      isUploadingPositioningFrame: false,
      isUploadingContinuousFrame: false,
    });
  },

  fetchUserRecoveryPlan() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${this.data.backendBaseUrl}/api/user_recovery_plans/${this.data.userId}`,
        method: 'GET',
        success: (res) => {
          if (res.statusCode === 200 && res.data) {
            const recoveryPlan = { ...res.data, stage: res.data.plan_name };
            this.setData({ currentRecoveryPlan: recoveryPlan });
            app.globalData.currentRecoveryPlan = recoveryPlan;
            resolve(recoveryPlan);
          } else {
            reject(new Error(res.data.message || '获取康复计划失败'));
          }
        },
        fail: (err) => { reject(err); }
      });
    });
  },

  initializeActionSequence() {
    const sequence = [];
    let totalExercises = 5;
    let demonstrationCount = 0;
    if (this.data.currentRecoveryPlan) {
      if (this.data.currentRecoveryPlan.stage === 'stage_one') totalExercises = 9;
      else if (this.data.currentRecoveryPlan.stage === 'stage_two') totalExercises = 15;
      // else if (this.data.currentRecoveryPlan.stage === 'stage_three') totalExercises = 1;
      // else if (this.data.currentRecoveryPlan.stage === 'stage_four') totalExercises = 2;
      // else if (this.data.currentRecoveryPlan.stage === 'stage_five') totalExercises = 3;
      // else if (this.data.currentRecoveryPlan.stage === 'stage_six') totalExercises = 5;
    }
    const BASE_VIDEO_URL = `${this.data.backendBaseUrl}/static/videos/`;
    for (let i = 1; i <= totalExercises; i++) {
      sequence.push({ type: 'explanation', name: `动作${i}讲解`, url: `${BASE_VIDEO_URL}intro/${i}.mp4`, exerciseNumber: i });
      sequence.push({ type: 'demonstration', name: `动作${i}演示`, url: `${BASE_VIDEO_URL}guide/${i}.mp4`, exerciseNumber: i });
      demonstrationCount++;
    }
    this.setData({ actionSequence: sequence, totalDemonstrationVideos: demonstrationCount });
  },

  startTraining() {
    if (!this.data.currentRecoveryPlan) {
      wx.showToast({ title: '请先获取康复计划信息', icon: 'none', duration: 2000 });
      return;
    }
    wx.request({
      url: `${this.data.backendBaseUrl}/api/recovery_records/start`,
      method: 'POST',
      data: { user_id: this.data.userId, plan_id: this.data.currentRecoveryPlan.plan_id },
      success: (res) => {
        if (res.data && res.data.record_id) {
          this.setData({ currentRecordId: res.data.record_id, isTrainingStarted: true, }, () => {
            this.startPositioningCheck();
          });
        } else {
          wx.showToast({ title: '创建训练记录失败', icon: 'none', duration: 2000 });
        }
      },
      fail: (err) => {
        console.error('创建恢复记录失败:', err);
        wx.showToast({ title: '网络错误，无法开始训练', icon: 'none', duration: 2000 });
      }
    });
  },

  startPositioningCheck() {
    this.clearAllTimers();
    this.setData({ isCameraVisibleForUser: true, countdown: 30 });

    if (this.data.audioContext) {
      this.data.audioContext.play();
    }

    this.data.countdownTimer = setInterval(() => {
      let newCountdown = this.data.countdown - 1;
      this.setData({ countdown: newCountdown });
      if (newCountdown <= 0) {
        clearInterval(this.data.countdownTimer);
        this.data.countdownTimer = null;
        this.returnToInitialStage('定位超时，请重新尝试。');
      }
    }, 1000);
    this.startCameraMonitoring(this.sendFrameToBackendForPositioning, 500);
  },

  startCameraMonitoring(callback, interval) {
    if (this.data.cameraMonitoringInterval) {
      clearInterval(this.data.cameraMonitoringInterval);
    }
    this.data.cameraMonitoringInterval = setInterval(() => {
      if (!this.data.cameraContext) return;
      this.data.cameraContext.takePhoto({
        quality: 'low',
        success: (res) => {
          if (res && res.tempImagePath) {
            callback(res.tempImagePath);
          }
        },
        fail: (err) => console.error('Camera takePhoto failed during monitoring:', err)
      });
    }, interval);
  },

  stopCameraMonitoring() {
    if (this.data.cameraMonitoringInterval) {
      clearInterval(this.data.cameraMonitoringInterval);
      this.data.cameraMonitoringInterval = null;

      if (this.data.audioContext) {
        this.data.audioContext.stop();
      }
    }
  },

  sendFrameToBackendForPositioning(imagePath) {
    if (!imagePath || this.data.isUploadingPositioningFrame) return;
    if (!this.data.isSpriteCanvasDimensionsSet) {
      wx.getImageInfo({
        src: imagePath,
        success: (info) => {
          if (info && info.width && info.height) {
            const frameWidth = info.width, frameHeight = info.height;
            const cols = 3, rows = 2;
            this.setData({
              spriteSheetCanvasWidth: frameWidth * cols,
              spriteSheetCanvasHeight: frameHeight * rows,
              isSpriteCanvasDimensionsSet: true
            }, () => { this._performPositioningUpload(imagePath); });
          } else { this._performPositioningUpload(imagePath); }
        },
        fail: () => { this._performPositioningUpload(imagePath); }
      });
    } else {
      this._performPositioningUpload(imagePath);
    }
  },

  _performPositioningUpload(imagePath) {
    this.setData({ isUploadingPositioningFrame: true });
    wx.uploadFile({
      url: `${this.data.backendBaseUrl}/detect_upper_body`,
      filePath: imagePath,
      name: 'image',
      success: (res) => {
        if (res && res.data) {
          const data = JSON.parse(res.data);
          if (data && typeof data.is_upper_body_in_frame === 'boolean') {
            if (data.is_upper_body_in_frame && !this.data.isPositioned) {
              this.onUserPositioned();
            }
          }
        }
      },
      fail: (err) => {
        console.error('Upload image for positioning failed:', err);
        this.returnToInitialStage('网络或服务器错误，请检查。');
      },
      complete: () => { this.setData({ isUploadingPositioningFrame: false }); }
    });
  },

  onUserPositioned() {
    this.clearAllTimers();
    this.setData({
      isPositioned: true,
      isCameraVisibleForUser: false,
      isPaused: false,
    }, () => {
      if (!this.data.videoPlayer) {
        this.data.videoPlayer = wx.createVideoContext('exerciseVideo');
      }
      this.playNextVideo();
    });
  },

  sendFrameToBackendForContinuousCheck(imagePath) {
    if (!imagePath || !this.data.isTrainingStarted || this.data.isPaused || this.data.isMonitoringPaused || this.data.isUploadingContinuousFrame) {
      return;
    }
    this.setData({ isUploadingContinuousFrame: true });
    wx.uploadFile({
      url: `${this.data.backendBaseUrl}/detect_upper_body`,
      filePath: imagePath,
      name: 'image',
      success: (res) => {
        if (res && res.data) {
          const data = JSON.parse(res.data);
          if (data && typeof data.is_upper_body_in_frame === 'boolean' && !data.is_upper_body_in_frame) {
            console.warn('用户上半身离开画面范围。暂停训练。');
            this.setData({ isPositioned: false, isCameraVisibleForUser: true, isPaused: true });
            if (this.data.videoPlayer) this.data.videoPlayer.pause();
            this.stopCameraMonitoring();
            this.stopSpriteSheetCaptureAndSend(true);
            this.startPositioningCheck();
            wx.showToast({ title: '请调整位置，训练已暂停', icon: 'none', duration: 3000 });
          }
        }
      },
      fail: (err) => console.error('上传图片到后端失败 (持续检测):', err),
      complete: () => { this.setData({ isUploadingContinuousFrame: false }); }
    });
  },

  returnToInitialStage(message = '训练已返回初始界面。') {
    this.clearAllTimers();
    wx.showToast({ title: message, icon: 'none', duration: 2000 });
    this.setData({
      currentRecordId: null, isTrainingStarted: false, isCameraVisibleForUser: false,
      isPositioned: false, isPaused: false, currentVideoUrl: '', currentActionIndex: 0,
      totalProgressPercentage: 0, completedDemonstrationVideos: 0, videoPlayer: null,
      isCapturingAndSendingFrames: false, isSpriteCanvasDimensionsSet: false,
      spriteSheetCanvasWidth: 0, spriteSheetCanvasHeight: 0, isFrameCanvasSizeSet: false,
    });
  },

  playNextVideo() {
    if (this.data.currentActionIndex >= this.data.actionSequence.length) {
      this.returnToInitialStage('恭喜您，训练已完成！');
      return;
    }
    const nextAction = this.data.actionSequence[this.data.currentActionIndex];
    const shouldCaptureFrames = (nextAction.type === 'demonstration');
    this.setData({
      showLoading: true, currentVideoUrl: nextAction.url, currentActionName: nextAction.name,
    }, () => {
      if (!this.data.videoPlayer) this.data.videoPlayer = wx.createVideoContext('exerciseVideo');
      if (!this.data.isPaused) this.data.videoPlayer.play();

      if (shouldCaptureFrames && !this.data.isPaused) {
        this.stopCameraMonitoring();
        this.startSpriteSheetCaptureAndSend();
      } else {
        this.stopSpriteSheetCaptureAndSend(false);
        if (!this.data.isPaused) {
          this.startCameraMonitoring(this.sendFrameToBackendForContinuousCheck, 1000);
        } else {
          this.stopCameraMonitoring();
        }
      }
    });
  },

  onVideoPlay() { this.setData({ showLoading: false }); },
  onVideoWaiting() { this.setData({ showLoading: true }); },
  onVideoError(e) { console.error('Video playback error:', e.detail); },

  /**
   * 新增：处理已完成动作的视频。
   * 调用后端API，将捕获的雪碧图拼接成视频。
   * @param {number} exerciseId - 已完成的动作ID (即 exerciseNumber)
   */
  processVideoForCompletedAction: function (exerciseId) {
    const recordId = this.data.currentRecordId;

    if (!recordId || !exerciseId) {
      console.error('缺少 record_id 或 exercise_id，无法处理视频。');
      return;
    }

    wx.request({
      url: `${this.data.backendBaseUrl}/api/process_exercise_video`,
      method: 'POST',
      data: {
        record_id: recordId,
        exercise_id: exerciseId
      },
      success: (res) => {
        if (res.statusCode === 201) {
          console.log(`视频处理成功`, res.data);
        } else {
          console.error(`视频处理失败`, res.data);
        }
      },
      fail: (err) => {
        console.error('视频处理请求失败 (网络错误):', err);
      }
    });
  },

  onVideoEnded() {
    this.stopSpriteSheetCaptureAndSend(true);
    this.stopCameraMonitoring();
    
    const finishedAction = this.data.actionSequence[this.data.currentActionIndex];
    
    if (finishedAction && finishedAction.type === 'demonstration') {
      this.setData({ completedDemonstrationVideos: this.data.completedDemonstrationVideos + 1 });
      this.processVideoForCompletedAction(finishedAction.exerciseNumber);
    }

    this.setData({ currentActionIndex: this.data.currentActionIndex + 1 });
    this.updateOverallProgress();
    this.playNextVideo();
  },

  /**
   * 【新增】处理视频时间更新事件
   */
  onVideoTimeUpdate(e) {
    const { currentTime, duration } = e.detail;
    if (duration > 0) {
      const progress = (currentTime / duration) * 100;
      this.setData({ currentVideoProgress: progress });
    }
  },

  updateOverallProgress() {
    if (this.data.totalDemonstrationVideos > 0) {
      const overallProgress = (this.data.completedDemonstrationVideos / this.data.totalDemonstrationVideos) * 100;
      this.setData({ totalProgressPercentage: overallProgress });
    }
  },

  togglePause() {
    this.setData({ isPaused: !this.data.isPaused }, () => {
      if (this.data.isPaused) {
        if (this.data.videoPlayer) this.data.videoPlayer.pause();
        this.stopCameraMonitoring();
        this.stopSpriteSheetCaptureAndSend(true);
        this.setData({ isCameraVisibleForUser: true });
      } else {
        if (this.data.videoPlayer) this.data.videoPlayer.play();
        this.setData({ isMonitoringPaused: true });
        setTimeout(() => {
          this.setData({ isMonitoringPaused: false });
          const currentAction = this.data.actionSequence[this.data.currentActionIndex];
          if (currentAction && currentAction.type === 'demonstration') {
            this.stopCameraMonitoring();
            this.startSpriteSheetCaptureAndSend();
          } else {
            this.startCameraMonitoring(this.sendFrameToBackendForContinuousCheck, 1000);
            this.stopSpriteSheetCaptureAndSend(false);
          }
        }, 2000);
        this.setData({ isCameraVisibleForUser: false });
      }
    });
  },

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

  skipCurrentAction() {
    wx.showModal({
      title: '跳过动作',
      content: '确定要跳过当前动作吗？这将跳过本动作的讲解和演示。',
      success: (res) => {
        if (res.confirm) {
          const currentAction = this.data.actionSequence[this.data.currentActionIndex];
          if (!currentAction) return;

          const currentExerciseNumber = currentAction.exerciseNumber;
          let nextActionIndex = this.data.actionSequence.findIndex(
            (action, index) => index > this.data.currentActionIndex && action.exerciseNumber !== currentExerciseNumber
          );

          if (nextActionIndex === -1) {
            nextActionIndex = this.data.actionSequence.length;
          }

          const isDemoCompleted = this.data.completedDemonstrationVideos >= currentExerciseNumber;
          if (!isDemoCompleted) {
            this.setData({ completedDemonstrationVideos: this.data.completedDemonstrationVideos + 1 });
          }

          this.setData({ currentActionIndex: nextActionIndex }, () => {
            if (this.data.videoPlayer) this.data.videoPlayer.stop();
            this.stopCameraMonitoring();
            this.stopSpriteSheetCaptureAndSend(false);
            this.updateOverallProgress();
            this.playNextVideo();
          });
        }
      }
    });
  },

  // =================================================================
  // 【核心修改区域】使用 CameraFrameListener 重构帧捕获逻辑
  // =================================================================

  startSpriteSheetCaptureAndSend() {
    if (this.data.isCapturingAndSendingFrames) return;
    if (!this.data.cameraListener) {
      console.error("帧监听器未初始化，无法开始。");
      return;
    }
    
    // 确保 Canvas 已就绪
    if (!this.data.isCanvasReady) {
      console.error("Canvas 未就绪，无法开始帧捕获");
      return;
    }
    
    this.data.spriteFramesBuffer = [];
    this.data.lastFrameTime = 0;
    this.setData({ isCapturingAndSendingFrames: true });
    
    this.data.cameraListener.start({
      success: () => { console.log('实时帧监听已启动。'); },
      fail: (err) => { 
        console.error('启动帧监听失败:', err);
        this.setData({ isCapturingAndSendingFrames: false });
      }
    });
  },

  stopSpriteSheetCaptureAndSend(sendRemaining = false) {
    if (!this.data.isCapturingAndSendingFrames) return;
    if (this.data.cameraListener) {
      this.data.cameraListener.stop();
      console.log('实时帧监听已停止。');
    }
    this.setData({ isCapturingAndSendingFrames: false });
    if (sendRemaining && this.data.spriteFramesBuffer.length > 0) {
      this.processAndSendSpriteSheet(true);
    } else {
      this.data.spriteFramesBuffer = [];
    }
  },

  handleCameraFrame(frame) {
    // 增加 Canvas 就绪状态的判断
    if (!this.data.isCapturingAndSendingFrames || !this.data.isCanvasReady) {
      return;
    }
  
    const now = Date.now();
    const frameInterval = 1000 / this.data.maxSpriteFrames;
    if (now - this.data.lastFrameTime < frameInterval) {
      return;
    }
    this.data.lastFrameTime = now;
    
    const canvas = this.data.frameCanvasNode;
    const ctx = this.data.frameCanvasContext;
  
    // 确保 Canvas 尺寸与帧数据匹配
    if (canvas.width !== frame.width || canvas.height !== frame.height) {
      // 降低分辨率以减少文件大小
      const scaleFactor = 0.6; // 降低到原尺寸的60%
      canvas.width = Math.floor(frame.width * scaleFactor);
      canvas.height = Math.floor(frame.height * scaleFactor);
      this.setData({
        frameCanvasWidth: Math.floor(frame.width * scaleFactor),
        frameCanvasHeight: Math.floor(frame.height * scaleFactor)
      });
    }
  
    try {
      // 创建缩小尺寸的图像数据
      const scaleFactor = 0.6;
      const scaledWidth = Math.floor(frame.width * scaleFactor);
      const scaledHeight = Math.floor(frame.height * scaleFactor);
      
      const tempCanvas = wx.createOffscreenCanvas({ type: '2d', width: frame.width, height: frame.height });
      const tempCtx = tempCanvas.getContext('2d');
      
      // 先将完整帧数据绘制到临时canvas
      const imageData = tempCtx.createImageData(frame.width, frame.height);
      imageData.data.set(new Uint8ClampedArray(frame.data));
      tempCtx.putImageData(imageData, 0, 0);
      
      // 然后缩小到主canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tempCanvas, 0, 0, frame.width, frame.height, 0, 0, canvas.width, canvas.height);
      
      // 转换为临时文件路径，降低质量
      wx.canvasToTempFilePath({
        canvas: canvas,
        fileType: 'jpg',
        quality: 0.4, // 进一步降低质量
        success: (fileRes) => {
          this.data.spriteFramesBuffer.push(fileRes.tempFilePath);
          if (this.data.spriteFramesBuffer.length >= this.data.maxSpriteFrames) {
            this.processAndSendSpriteSheet();
          }
        },
        fail: (err) => console.error('canvasToTempFilePath 失败:', err)
      }, this);
    } catch (error) {
      console.error('处理相机帧数据失败:', error);
    }
  },

  processAndSendSpriteSheet(forceSend = false) {
    if (this.data.spriteFramesBuffer.length === 0) return;
    if (!forceSend && this.data.spriteFramesBuffer.length < this.data.maxSpriteFrames) return;

    const framesToSend = this.data.spriteFramesBuffer.splice(0, this.data.maxSpriteFrames);
    if (framesToSend.length === 0) return;
    
    // if (framesToSend.length > 0) {
    //     this.sendFrameToBackendForContinuousCheck(framesToSend[0]);
    // }

    const currentAction = this.data.actionSequence[this.data.currentActionIndex];
    const actionCategory = currentAction ? currentAction.exerciseNumber : 'unknown';
    this.sendSpriteSheetToBackend(framesToSend, actionCategory);
  },

  sendSpriteSheetToBackend(spriteSheetImagePaths, actionCategory) {
    if (spriteSheetImagePaths.length === 0) return;
    
    // 减少雪碧图尺寸
    const scaleFactor = 0.5; // 缩小50%
    const cols = 3, rows = 2;
    const originalFrameWidth = this.data.spriteSheetCanvasWidth / cols;
    const originalFrameHeight = this.data.spriteSheetCanvasHeight / rows;
    
    const scaledWidth = Math.floor(this.data.spriteSheetCanvasWidth * scaleFactor);
    const scaledHeight = Math.floor(this.data.spriteSheetCanvasHeight * scaleFactor);
    const scaledFrameWidth = Math.floor(originalFrameWidth * scaleFactor);
    const scaledFrameHeight = Math.floor(originalFrameHeight * scaleFactor);
  
    const query = wx.createSelectorQuery().in(this);
    query.select('#spriteSheetCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          console.error('获取 spriteSheetCanvas 节点失败。');
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        
        // 使用缩小后的尺寸
        canvas.width = scaledWidth;
        canvas.height = scaledHeight;
        ctx.clearRect(0, 0, scaledWidth, scaledHeight);
  
        let loadedImagesCount = 0;
        const imagesToLoad = spriteSheetImagePaths.length;
        if (imagesToLoad === 0) return;
  
        const checkAllImagesLoadedAndDraw = () => {
          loadedImagesCount++;
          if (loadedImagesCount === imagesToLoad) {
            wx.canvasToTempFilePath({
              canvas: canvas,
              quality: 0.3, // 大幅降低质量
              fileType: 'jpg',
              success: (res) => {
                this.uploadSingleSpriteSheet(res.tempFilePath, actionCategory, imagesToLoad);
              },
              fail: (err) => console.error('Failed to generate sprite sheet:', err)
            }, this);
          }
        };
  
        spriteSheetImagePaths.forEach((imagePath, index) => {
          const img = canvas.createImage();
          img.onload = () => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            ctx.drawImage(
              img, 
              col * scaledFrameWidth, 
              row * scaledFrameHeight, 
              scaledFrameWidth, 
              scaledFrameHeight
            );
            checkAllImagesLoadedAndDraw();
          };
          img.onerror = () => {
            console.error(`Failed to load image for sprite sheet: ${imagePath}`);
            checkAllImagesLoadedAndDraw();
          };
          img.src = imagePath;
        });
      });
  },

  uploadSingleSpriteSheet(spriteSheetPath, actionCategory, frameCount) {
    wx.uploadFile({
      url: `${this.data.backendBaseUrl}/upload_sprite_sheet`,
      filePath: spriteSheetPath,
      name: 'sprite_sheet',
      formData: {
          'actionCategory': actionCategory,
          'frame_count': frameCount.toString(),
          'record_id': this.data.currentRecordId
      },
      success: (res) => {
        if (res.statusCode === 200) {
          console.log('Sprite sheet uploaded successfully.');
        } else {
          console.error(`Sprite sheet upload failed with status ${res.statusCode}`);
        }
      },
      fail: (err) => {
        console.error('Sprite sheet upload failed (network):', err);
      }
    });
  },

  onCameraError(e) {
    console.error('Camera error:', e.detail);
    wx.showModal({
      title: '摄像头异常',
      content: '无法访问摄像头，请检查权限设置或稍后重试。',
      showCancel: false,
      confirmText: '返回',
      success: (res) => { if (res.confirm) this.returnToInitialStage(); }
    });
  },

  onCameraStop() {
    console.warn('Camera stopped unexpectedly.');
    if (this.data.isTrainingStarted && !this.data.isPaused && this.data.isPositioned) {
      this.returnToInitialStage('摄像头异常中断。');
    }
  },

  handleHome: function () {
    wx.navigateTo({ url: '/pages/home/home' });
  },
});
