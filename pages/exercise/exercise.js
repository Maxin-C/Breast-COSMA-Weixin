// pages/exercise/exercise.js
// 获取微信的语音合成插件
const plugin = requirePlugin("WechatSI");
// 获取App实例以访问全局数据
const app = getApp();
Page({
      data: {
        // UI State (UI状态)    
        isTrainingStarted: false,
        isCameraVisibleForUser: false,
        isPositioned: false,
        isPaused: false,
        showLoading: false,
        isTrainingFinished: false,
        initialMessage: '正在加载康复计划...',
        feedbackText: '',
        // 新增：用于在界面上显示实时反馈文本    
        // Camera related (摄像头相关)    
        cameraContext: null,
        countdown: 30,
        countdownTimer: null,
        cameraMonitoringInterval: null,
        cameraHeight: 300,
        userId: 1,
        // CameraFrameListener 相关状态    
        cameraListener: null,
        lastFrameTime: 0,
        isCapturingAndSendingFrames: false,
        videoPlayer: null,
        currentVideoUrl: '',
        currentActionIndex: 0,
        actionSequence: [],
        currentActionName: '',
        currentVideoProgress: 0,
        actionNameList: ["其他", "握拳松拳", "手腕旋转", "前臂屈伸", "摸肩膀", "摸耳朵", "深呼吸", "梳头", "耸肩", "转体运动", "过顶触耳", "钟摆运动", "爬墙运动", "画圈圈", "滑轮运动", "洗后背运动"],
        elapsedTime: 0,
        elapsedTimeTimer: null,
        // Progress tracking (进度跟踪)    
        totalDemonstrationVideos: 0,
        completedDemonstrationVideos: 0,
        totalProgressPercentage: 0,
        // Sprite Sheet related (雪碧图相关)    
        spriteFramesBuffer: [],
        maxSpriteFrames: 6,
        // 用于处理单帧数据的隐藏canvas尺寸和节点    
        frameCanvasNode: null,
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
        audioContext: null,
        evaluationResults: [],
        summaryReport: '',
        isSummaryLoading: true,
        isFeedbackThrottled: false,
      },
      isWaitingForFeedbackLock: false,
      onLoad() {
        const sysInfo = wx.getSystemInfoSync();
        this.setData({
          cameraHeight: sysInfo.windowHeight * 0.7,
          isTrainingStarted: false,
          backendBaseUrl: app.globalData.backendBaseUrl,
        });
        this.data.cameraContext = wx.createCameraContext();
        this.initAudioPlayerWithCaching();
        this.initCameraListener();
        const userId = wx.getStorageSync('user_id');
        if (userId) {
          this.setData({
            userId: userId
          });
          this.startTrainingProcess();
        } else {
          wx.showToast({
            title: '未找到用户ID，请重新登录',
            icon: 'none',
            duration: 2000
          });
          this.returnToInitialStage('加载失败，请返回重试。');
        }
      },
      onReady() {
        const query = wx.createSelectorQuery().in(this);
        query.select('#frameCanvas').fields({
          node: true,
          size: true
        }).exec((res) => {
          if (res && res[0] && res[0].node) {
            const canvas = res[0].node;
            const ctx = canvas.getContext('2d');
            canvas.width = this.data.frameCanvasWidth;
            canvas.height = this.data.frameCanvasHeight;
            this.setData({
              frameCanvasNode: canvas,
              frameCanvasContext: ctx,
              isCanvasReady: true,
              isFrameCanvasSizeSet: true
            });
            console.log('Frame canvas node and context are ready.');
          } else {
            console.error('获取 frameCanvas 节点失败，后续帧处理将无法进行。');
          }
        });
      },
      onUnload() {
        this.clearAllTimers();
        if (this.data.audioContext) {
          this.data.audioContext.destroy();
        }
      },
      clearAllTimers() {
        if (this.data.audioContext) this.data.audioContext.stop();
        if (this.data.countdownTimer) clearInterval(this.data.countdownTimer);
        if (this.data.cameraMonitoringInterval) clearInterval(this.data.cameraMonitoringInterval);
        if (this.data.elapsedTimeTimer) clearInterval(this.data.elapsedTimeTimer);
        this.data.countdownTimer = null;
        this.data.cameraMonitoringInterval = null;
        this.data.elapsedTimeTimer = null;
        if (this.data.isCapturingAndSendingFrames) {
          this.stopSpriteSheetCaptureAndSend(false);
        }
        this.data.spriteFramesBuffer = [];
        this.setData({
          isUploadingPositioningFrame: false,
          isUploadingContinuousFrame: false,
        });
      },
      startTrainingProcess() {
        this.setData({
          initialMessage: '正在加载您的康复计划...'
        });
        this.fetchUserRecoveryPlan()
          .then(() => this.initializeActionSequence())
          .then(() => {
            this.startTraining();
          }).catch(err => {
            console.error('初始化训练失败:',
              err);
            this.returnToInitialStage('加载康复计划失败，请点击按钮重试。');
          });
      },
      initAudioPlayerWithCaching() {
        const AUDIO_URL = `${
this.data.backendBaseUrl}
/static/audios/upper_guidance.mp3`;
        const STORAGE_KEY = 'cached_audio_path';
        const fs = wx.getFileSystemManager();
        const audioCtx = wx.createInnerAudioContext();
        audioCtx.loop = false;
        wx.getStorage({
          key: STORAGE_KEY,
          success: (res) => {
            const savedPath = res.data;
            fs.access({
              path: savedPath,
              success: () => {
                console.log('使用已缓存的音频文件:',
                  savedPath);
                audioCtx.src = savedPath;
                this.setData({
                  audioContext: audioCtx
                });
              },
              fail: () => {
                console.warn('缓存文件已失效，重新下载。');
                this.downloadAndCacheAudio(AUDIO_URL,
                  STORAGE_KEY,
                  audioCtx,
                  fs);
              }
            });
          },
          fail: () => {
            console.log('未找到音频缓存，开始下载。');
            this.downloadAndCacheAudio(AUDIO_URL,
              STORAGE_KEY,
              audioCtx,
              fs);
          }
        });
      },
      downloadAndCacheAudio(url,
        storageKey,
        audioCtx,
        fs) {
        wx.downloadFile({
          url: url,
          success: (res) => {
            if (res.statusCode === 200) {
              fs.saveFile({
                tempFilePath: res.tempFilePath,
                success: (saveRes) => {
                  const permanentPath = saveRes.savedFilePath;
                  console.log('音频下载并缓存成功:',
                    permanentPath);
                  wx.setStorage({
                    key: storageKey,
                    data: permanentPath
                  });
                  audioCtx.src = permanentPath;
                  this.setData({
                    audioContext: audioCtx
                  });
                },
                fail: (err) => console.error('保存音频文件失败:',
                  err)
              });
            } else {
              console.error('下载音频文件失败,服务器状态码: ',res.statusCode);
            }
          },
          fail: (err) => console.error('下载音频文件网络错误:',
            err)
        });
      },
      initCameraListener() {
        if (!this.data.cameraContext) {
          console.error("CameraContext not ready,cannot init listener.");
            return;
          }
          this.data.cameraListener = this.data.cameraContext.onCameraFrame((frame) => {
            this.handleCameraFrame(frame);
          });
          console.log("Camera frame listener initialized.");
        },
        fetchUserRecoveryPlan() {
            return new Promise((resolve,
              reject) => {
              wx.request({
                url: `${
this.data.backendBaseUrl}
/api/user_recovery_plans/${
this.data.userId}
`,
                method: 'GET',
                success: (res) => {
                  if (res.statusCode === 200 && res.data) {
                    const recoveryPlan = {
                      ...res.data,
                      stage: res.data.plan_name
                    };
                    this.setData({
                      currentRecoveryPlan: recoveryPlan
                    });
                    app.globalData.currentRecoveryPlan = recoveryPlan;
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
          initializeActionSequence() {
            return new Promise((resolve,
              reject) => {
              wx.request({
                url: `${
this.data.backendBaseUrl}
/user_recovery_plans/${
this.data.userId}
/exercises`,
                method: 'GET',
                success: (res) => {
                  if (res.statusCode === 200 && res.data && res.data.exercise_ids) {
                    const exerciseIds = res.data.exercise_ids;
                    const sequence = [];
                    let demonstrationCount = 0;
                    const BASE_VIDEO_URL = `${
this.data.backendBaseUrl}
/static/videos/`;
                    exerciseIds.forEach(id => {
                      sequence.push({
                        type: 'explanation',
                        name: `动作${
id}
讲解`,
                        url: `${
BASE_VIDEO_URL}
intro/${
id}
.mp4`,
                        exerciseNumber: id
                      });
                      sequence.push({
                        type: 'demonstration',
                        name: this.data.actionNameList[id],
                        url: `${
BASE_VIDEO_URL}
guide/${
id}
.mp4`,
                        exerciseNumber: id
                      });
                      demonstrationCount++;
                    });
                    this.setData({
                      actionSequence: sequence,
                      totalDemonstrationVideos: demonstrationCount
                    });
                    resolve();
                  } else {
                    console.error('获取动作列表失败:',
                      res);
                    wx.showToast({
                      title: '无法获取训练动作列表',
                      icon: 'none'
                    });
                    reject(new Error('Failed to fetch exercise IDs'));
                  }
                },
                fail: (err) => {
                  console.error('请求动作列表失败:',
                    err);
                  wx.showToast({
                    title: '网络错误，无法获取动作列表',
                    icon: 'none'
                  });
                  reject(err);
                }
              });
            });
          },
          startTraining() {
            if (this.data.isTrainingStarted) {
              return;
            }
            wx.request({
              url: `${
this.data.backendBaseUrl}
/api/recovery_records/start`,
              method: 'POST',
              data: {
                user_id: this.data.userId,
                plan_id: this.data.currentRecoveryPlan.plan_id
              },
              success: (res) => {
                if (res.data && res.data.record_id) {
                  this.setData({
                      currentRecordId: res.data.record_id,
                      isTrainingStarted: true,
                      isTrainingFinished: false,
                      evaluationResults: [],
                      summaryReport: '',
                    },
                    () => {
                      this.startPositioningCheck();
                    }
                  );
                } else {
                  wx.showToast({
                    title: '创建训练记录失败',
                    icon: 'none',
                    duration: 2000
                  });
                  this.returnToInitialStage('无法创建训练记录，请重试。');
                }
              },
              fail: (err) => {
                console.error('创建恢复记录失败:',
                  err);
                wx.showToast({
                  title: '网络错误，无法开始训练',
                  icon: 'none',
                  duration: 2000
                });
                this.returnToInitialStage('网络错误，请点击按钮重试。');
              }
            });
          },
          startPositioningCheck() {
            this.clearAllTimers();
            this.setData({
              isCameraVisibleForUser: true,
              countdown: 30
            });
            if (this.data.audioContext) {
              this.data.audioContext.play();
            }
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
              },
              1000);
            this.startCameraMonitoring(this.sendFrameToBackendForPositioning,
              500);
          },
          startCameraMonitoring(callback,
            interval) {
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
                  fail: (err) => console.error('Camera takePhoto failed during monitoring:',
                    err)
                });
              },
              interval);
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
                    const frameWidth = info.width,
                      frameHeight = info.height;
                    const cols = 3,
                      rows = 2;
                    this.setData({
                        spriteSheetCanvasWidth: frameWidth * cols,
                        spriteSheetCanvasHeight: frameHeight * rows,
                        isSpriteCanvasDimensionsSet: true
                      },
                      () => {
                        this._performPositioningUpload(imagePath);
                      }
                    );
                  } else {
                    this._performPositioningUpload(imagePath);
                  }
                },
                fail: () => {
                  this._performPositioningUpload(imagePath);
                }
              });
            } else {
              this._performPositioningUpload(imagePath);
            }
          },
          _performPositioningUpload(imagePath) {
            this.setData({
              isUploadingPositioningFrame: true
            });
            wx.uploadFile({
              url: `${
this.data.backendBaseUrl}
/detect_upper_body`,
              filePath: imagePath,
              name: 'image',
              formData: {
                'user_id': this.data.userId.toString()
              },
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
                console.error('Upload image for positioning failed:',
                  err);
                this.returnToInitialStage('网络或服务器错误，请检查。');
              },
              complete: () => {
                this.setData({
                  isUploadingPositioningFrame: false
                });
              }
            });
          },
          onUserPositioned() {
            this.clearAllTimers();
            this.setData({
                isPositioned: true,
                isCameraVisibleForUser: false,
                isPaused: false,
              },
              () => {
                if (!this.data.videoPlayer) {
                  this.data.videoPlayer = wx.createVideoContext('exerciseVideo');
                }
                this.playNextVideo();
              }
            );
          },
          sendFrameToBackendForContinuousCheck(imagePath) {
            if (!imagePath || !this.data.isTrainingStarted || this.data.isPaused || this.data.isMonitoringPaused || this.data.isUploadingContinuousFrame) {
              return;
            }
            this.setData({
              isUploadingContinuousFrame: true
            });
            wx.uploadFile({
              url: `${
this.data.backendBaseUrl}
/detect_upper_body`,
              filePath: imagePath,
              name: 'image',
              success: (res) => {
                if (res && res.data) {
                  const data = JSON.parse(res.data);
                  if (data && typeof data.is_upper_body_in_frame === 'boolean' && !data.is_upper_body_in_frame) {
                    console.warn('用户上半身离开画面范围。暂停训练。');
                    this.setData({
                      isPositioned: false,
                      isCameraVisibleForUser: true,
                      isPaused: true
                    });
                    if (this.data.videoPlayer) this.data.videoPlayer.pause();
                    this.stopCameraMonitoring();
                    this.stopSpriteSheetCaptureAndSend(true);
                    this.startPositioningCheck();
                    wx.showToast({
                      title: '请调整位置，训练已暂停',
                      icon: 'none',
                      duration: 3000
                    });
                  }
                }
              },
              fail: (err) => console.error('上传图片到后端失败 (持续检测):',
                err),
              complete: () => {
                this.setData({
                  isUploadingContinuousFrame: false
                });
              }
            });
          },
          returnToInitialStage(message = '训练已终止。') {
            this.clearAllTimers();
            this.setData({
              initialMessage: message,
              isTrainingStarted: false,
              isTrainingFinished: false,
              currentRecordId: null,
              isCameraVisibleForUser: false,
              isPositioned: false,
              isPaused: false,
              currentVideoUrl: '',
              currentActionIndex: 0,
              totalProgressPercentage: 0,
              completedDemonstrationVideos: 0,
              videoPlayer: null,
              isCapturingAndSendingFrames: false,
            });
          },
          playNextVideo() {
            const nextAction = this.data.actionSequence[this.data.currentActionIndex];
            if (!nextAction) {
              this.handleTrainingCompletion();
              return;
            }
            const shouldCaptureFrames = (nextAction.type === 'demonstration');
            this.setData({
                showLoading: true,
                currentVideoUrl: nextAction.url,
                currentActionName: nextAction.name,
                feedbackText: '',
                // 清空上一条反馈    
              },
              () => {
                if (!this.data.videoPlayer) this.data.videoPlayer = wx.createVideoContext('exerciseVideo');
                if (!this.data.isPaused) this.data.videoPlayer.play();
                if (shouldCaptureFrames && !this.data.isPaused) {
                  this.stopCameraMonitoring();
                  this.startElapsedTimeTimer();
                  this.startSpriteSheetCaptureAndSend();
                } else {
                  this.stopElapsedTimeTimer();
                  this.stopSpriteSheetCaptureAndSend(false);
                  if (!this.data.isPaused) {
                    this.startCameraMonitoring(this.sendFrameToBackendForContinuousCheck,
                      1000);
                  } else {
                    this.stopCameraMonitoring();
                  }
                }
              }
            );
          },
          startElapsedTimeTimer() {
            if (this.data.elapsedTimeTimer) clearInterval(this.data.elapsedTimeTimer);
            this.setData({
              elapsedTime: 0
            });
            this.data.elapsedTimeTimer = setInterval(() => {
                this.setData({
                  elapsedTime: this.data.elapsedTime + 1
                });
              },
              1000);
          },
          stopElapsedTimeTimer() {
            if (this.data.elapsedTimeTimer) clearInterval(this.data.elapsedTimeTimer);
            this.data.elapsedTimeTimer = null;
            this.setData({
              elapsedTime: 0
            });
          },
          onVideoPlay() {
            this.setData({
              showLoading: false
            });
          },
          onVideoWaiting() {
            this.setData({
              showLoading: true
            });
          },
          onVideoError(e) {
            console.error('Video playback error:',
              e.detail);
          },
          processVideoForCompletedAction: function (exerciseId) {
            const recordId = this.data.currentRecordId;
            if (!recordId || !exerciseId) {
              console.error('缺少 record_id 或 exercise_id，无法处理视频。');
              return;
            }
            wx.request({
              url: `${
this.data.backendBaseUrl}
/api/process_exercise_video`,
              method: 'POST',
              data: {
                record_id: recordId,
                exercise_id: exerciseId
              },
              success: (res) => {
                if (res.statusCode === 201) {
                  console.log(`视频处理成功`,
                    res.data);
                } else {
                  console.error(`视频处理失败`,
                    res.data);
                }
              },
              fail: (err) => {
                console.error('视频处理请求失败 (网络错误):',
                  err);
              }
            });
          },
          async onVideoEnded() {
              this.stopSpriteSheetCaptureAndSend(true);
              this.stopCameraMonitoring();
              this.stopElapsedTimeTimer();
              const finishedAction = this.data.actionSequence[this.data.currentActionIndex];
              if (finishedAction && finishedAction.type === 'demonstration') {
                await this.processAndEvaluateAction(finishedAction.exerciseNumber,
                  finishedAction.name);
                this.setData({
                  completedDemonstrationVideos: this.data.completedDemonstrationVideos + 1
                });
              }
              this.updateOverallProgress();
              if (this.data.completedDemonstrationVideos >= this.data.totalDemonstrationVideos) {
                this.handleTrainingCompletion();
                return;
              }
              this.setData({
                currentActionIndex: this.data.currentActionIndex + 1
              });
              this.playNextVideo();
            },
            onVideoTimeUpdate(e) {
              const {
                currentTime,
                duration
              } = e.detail;
              if (duration > 0) {
                const progress = (currentTime / duration) * 100;
                this.setData({
                  currentVideoProgress: progress
                });
              }
            },
            updateOverallProgress() {
              if (this.data.totalDemonstrationVideos > 0) {
                const overallProgress = (this.data.completedDemonstrationVideos / this.data.totalDemonstrationVideos) * 100;
                this.setData({
                  totalProgressPercentage: overallProgress
                });
              }
            },
            togglePause() {
              this.setData({
                  isPaused: !this.data.isPaused
                },
                () => {
                  if (this.data.isPaused) {
                    if (this.data.videoPlayer) this.data.videoPlayer.pause();
                    this.stopCameraMonitoring();
                    this.stopSpriteSheetCaptureAndSend(true);
                    if (this.data.elapsedTimeTimer) clearInterval(this.data.elapsedTimeTimer);
                    this.setData({
                      isCameraVisibleForUser: true
                    });
                  } else {
                    if (this.data.videoPlayer) this.data.videoPlayer.play();
                    this.startElapsedTimeTimer();
                    this.setData({
                      isMonitoringPaused: true
                    });
                    setTimeout(() => {
                        this.setData({
                          isMonitoringPaused: false
                        });
                        const currentAction = this.data.actionSequence[this.data.currentActionIndex];
                        if (currentAction && currentAction.type === 'demonstration') {
                          this.stopCameraMonitoring();
                          this.startSpriteSheetCaptureAndSend();
                        } else {
                          this.startCameraMonitoring(this.sendFrameToBackendForContinuousCheck,
                            1000);
                          this.stopSpriteSheetCaptureAndSend(false);
                        }
                      },
                      2000);
                    this.setData({
                      isCameraVisibleForUser: false
                    });
                  }
                }
              );
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
                    let nextActionIndex = this.data.actionSequence.findIndex((action,
                      index) => index > this.data.currentActionIndex && action.exerciseNumber !== currentExerciseNumber);
                    if (nextActionIndex === -1) {
                      nextActionIndex = this.data.actionSequence.length;
                    }
                    const isDemoCompleted = this.data.completedDemonstrationVideos >= currentExerciseNumber;
                    if (!isDemoCompleted) {
                      this.setData({
                        completedDemonstrationVideos: this.data.completedDemonstrationVideos + 1
                      });
                    }
                    this.setData({
                        currentActionIndex: nextActionIndex
                      },
                      () => {
                        if (this.data.videoPlayer) this.data.videoPlayer.stop();
                        this.stopCameraMonitoring();
                        this.stopSpriteSheetCaptureAndSend(false);
                        this.stopElapsedTimeTimer();
                        this.updateOverallProgress();
                        this.playNextVideo();
                      }
                    );
                  }
                }
              });
            },
            processAndEvaluateAction(exerciseId,
              actionName) {
              return new Promise((resolve) => {
                const recordId = this.data.currentRecordId;
                if (!recordId || !exerciseId) {
                  console.error('缺少 record_id 或 exercise_id，无法处理视频。');
                  return resolve();
                }
                wx.request({
                  url: `${
this.data.backendBaseUrl}
/reports/evaluate`,
                  method: 'POST',
                  data: {
                    record_id: recordId,
                    exercise_id: exerciseId
                  },
                  success: (res) => {
                    if (res.statusCode === 201 && res.data.success) {
                      console.log(`动作 ${
exerciseId}
 评估成功`,
                        res.data.evaluation);
                      const evaluation = JSON.parse(res.data.evaluation);
                      const newResult = {
                        exerciseId: exerciseId,
                        actionName: actionName,
                        score: Number(evaluation.score),
                        report: evaluation.report
                      };
                      this.setData({
                        evaluationResults: [...this.data.evaluationResults,
                          newResult
                        ]
                      });
                    } else {
                      console.error(`动作 ${
exerciseId}
 评估失败`,
                        res.data);
                      const newResult = {
                        exerciseId,
                        actionName,
                        score: 0,
                        report: "评估失败，请稍后重试。"
                      };
                      this.setData({
                        evaluationResults: [...this.data.evaluationResults,
                          newResult
                        ]
                      });
                    }
                  },
                  fail: (err) => {
                    console.error('评估请求网络错误:',
                      err);
                    const newResult = {
                      exerciseId,
                      actionName,
                      score: 0,
                      report: "网络错误，评估失败。"
                    };
                    this.setData({
                      evaluationResults: [...this.data.evaluationResults,
                        newResult
                      ]
                    });
                  },
                  complete: () => {
                    wx.hideLoading();
                    resolve();
                  }
                });
              });
            },
            handleTrainingCompletion() {
              console.log("训练完成，正在停止所有摄像头活动...");
              this.stopFrameListener();
              this.clearAllTimers();
              this.setData({
                isTrainingFinished: true
              });
              this.data.evaluationResults.sort((a,
                b) => a.exerciseId - b.exerciseId);
              this.setData({
                evaluationResults: this.data.evaluationResults
              });
              this.fetchSummaryReport();
            },
            stopFrameListener() {
              if (this.data.cameraListener) {
                this.data.cameraListener.stop();
              }
              this.setData({
                isCapturingAndSendingFrames: false
              });
            },
            fetchSummaryReport() {
              const recordId = this.data.currentRecordId;
              if (!recordId) return;
              this.setData({
                isSummaryLoading: true
              });
              wx.request({
                url: `${
this.data.backendBaseUrl}
/reports/${
recordId}
/summarize`,
                method: 'POST',
                success: (res) => {
                  if (res.statusCode === 200 && res.data.success) {
                    this.setData({
                      summaryReport: res.data.summary
                    });
                  } else {
                    this.setData({
                      summaryReport: '生成综合报告失败，请稍后重试。'
                    });
                  }
                },
                fail: (err) => {
                  console.error('获取综合报告失败:',
                    err);
                  this.setData({
                    summaryReport: '网络错误，无法获取综合报告。'
                  });
                },
                complete: () => {
                  this.setData({
                    isSummaryLoading: false
                  });
                }
              });
            },
            redirectToChat() {
              wx.redirectTo({
                url: '/pages/chat/chat'
              });
            },
            startSpriteSheetCaptureAndSend() {
              if (this.data.isCapturingAndSendingFrames) return;
              if (!this.data.cameraListener) {
                console.error("帧监听器未初始化，无法开始。");
                return;
              }
              if (!this.data.isCanvasReady) {
                console.error("Canvas 未就绪，无法开始帧捕获");
                return;
              }
              this.data.spriteFramesBuffer = [];
              this.data.lastFrameTime = 0;
              this.setData({
                isCapturingAndSendingFrames: true
              });
              this.data.cameraListener.start({
                success: () => {
                  console.log('实时帧监听已启动。');
                },
                fail: (err) => {
                  console.error('启动帧监听失败:',
                    err);
                  this.setData({
                    isCapturingAndSendingFrames: false
                  });
                }
              });
            },
            stopSpriteSheetCaptureAndSend(sendRemaining = false) {
              if (!this.data.isCapturingAndSendingFrames) return;
              if (this.data.cameraListener) {
                this.data.cameraListener.stop();
                console.log('实时帧监听已停止。');
              }
              this.setData({
                isCapturingAndSendingFrames: false
              });
              if (sendRemaining && this.data.spriteFramesBuffer.length > 0) {
                this.processAndSendSpriteSheet(true);
              } else {
                this.data.spriteFramesBuffer = [];
              }
            },
            handleCameraFrame(frame) {
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
              if (canvas.width !== frame.width || canvas.height !== frame.height) {
                const scaleFactor = 0.6;
                canvas.width = Math.floor(frame.width * scaleFactor);
                canvas.height = Math.floor(frame.height * scaleFactor);
                this.setData({
                  frameCanvasWidth: Math.floor(frame.width * scaleFactor),
                  frameCanvasHeight: Math.floor(frame.height * scaleFactor)
                });
              }
              try {
                const scaleFactor = 0.6;
                const scaledWidth = Math.floor(frame.width * scaleFactor);
                const scaledHeight = Math.floor(frame.height * scaleFactor);
                const tempCanvas = wx.createOffscreenCanvas({
                  type: '2d',
                  width: frame.width,
                  height: frame.height
                });
                const tempCtx = tempCanvas.getContext('2d');
                const imageData = tempCtx.createImageData(frame.width,
                  frame.height);
                imageData.data.set(new Uint8ClampedArray(frame.data));
                tempCtx.putImageData(imageData,
                  0,
                  0);
                ctx.clearRect(0,
                  0,
                  canvas.width,
                  canvas.height);
                ctx.drawImage(tempCanvas,
                  0,
                  0,
                  frame.width,
                  frame.height,
                  0,
                  0,
                  canvas.width,
                  canvas.height);
                wx.canvasToTempFilePath({
                    canvas: canvas,
                    fileType: 'jpg',
                    quality: 0.4,
                    success: (fileRes) => {
                      this.data.spriteFramesBuffer.push(fileRes.tempFilePath);
                      if (this.data.spriteFramesBuffer.length >= this.data.maxSpriteFrames) {
                        this.processAndSendSpriteSheet();
                      }
                    },
                    fail: (err) => console.error('canvasToTempFilePath 失败:',
                      err)
                  },
                  this);
              } catch (error) {
                console.error('处理相机帧数据失败:',
                  error);
              }
            },
            processAndSendSpriteSheet(forceSend = false) {
              if (this.data.spriteFramesBuffer.length === 0) return;
              if (!forceSend && this.data.spriteFramesBuffer.length < this.data.maxSpriteFrames) return;
              const framesToSend = this.data.spriteFramesBuffer.splice(0,
                this.data.maxSpriteFrames);
              if (framesToSend.length === 0) return;
              const currentAction = this.data.actionSequence[this.data.currentActionIndex];
              const actionCategory = currentAction ? currentAction.exerciseNumber : 'unknown';
              this.sendSpriteSheetToBackend(framesToSend,
                actionCategory);
            },
            sendSpriteSheetToBackend(spriteSheetImagePaths,
              actionCategory) {
              if (spriteSheetImagePaths.length === 0) return;
              const scaleFactor = 0.5;
              const cols = 3,
                rows = 2;
              const originalFrameWidth = this.data.spriteSheetCanvasWidth / cols;
              const originalFrameHeight = this.data.spriteSheetCanvasHeight / rows;
              const scaledWidth = Math.floor(this.data.spriteSheetCanvasWidth * scaleFactor);
              const scaledHeight = Math.floor(this.data.spriteSheetCanvasHeight * scaleFactor);
              const scaledFrameWidth = Math.floor(originalFrameWidth * scaleFactor);
              const scaledFrameHeight = Math.floor(originalFrameHeight * scaleFactor);
              const query = wx.createSelectorQuery().in(this);
              query.select('#spriteSheetCanvas').fields({
                node: true,
                size: true
              }).exec((res) => {
                if (!res || !res[0] || !res[0].node) {
                  console.error('获取 spriteSheetCanvas 节点失败。');
                  return;
                }
                const canvas = res[0].node;
                const ctx = canvas.getContext('2d');
                canvas.width = scaledWidth;
                canvas.height = scaledHeight;
                ctx.clearRect(0,
                  0,
                  scaledWidth,
                  scaledHeight);
                let loadedImagesCount = 0;
                const imagesToLoad = spriteSheetImagePaths.length;
                if (imagesToLoad === 0) return;
                const checkAllImagesLoadedAndDraw = () => {
                  loadedImagesCount++;
                  if (loadedImagesCount === imagesToLoad) {
                    wx.canvasToTempFilePath({
                        canvas: canvas,
                        quality: 0.3,
                        fileType: 'jpg',
                        success: (res) => {
                          this.uploadSingleSpriteSheet(res.tempFilePath,
                            actionCategory);
                        },
                        fail: (err) => console.error('Failed to generate sprite sheet:',
                          err)
                      },
                      this);
                  }
                };
                spriteSheetImagePaths.forEach((imagePath,
                  index) => {
                  const img = canvas.createImage();
                  img.onload = () => {
                    const col = index % cols;
                    const row = Math.floor(index / cols);
                    ctx.drawImage(img,
                      col * scaledFrameWidth,
                      row * scaledFrameHeight,
                      scaledFrameWidth,
                      scaledFrameHeight);
                    checkAllImagesLoadedAndDraw();
                  };
                  img.onerror = () => {
                    console.error(`Failed to load image for sprite sheet: ${
imagePath}
`);
                    checkAllImagesLoadedAndDraw();
                  };
                  img.src = imagePath;
                });
              });
            },
            uploadSingleSpriteSheet(spriteSheetPath,
              actionCategory) {
              if (this.data.isPaused) {
                console.log("Upload skipped: Paused.");
                return;
              }
              wx.uploadFile({
                url: `${
this.data.backendBaseUrl}
/reports/upload_sprites`,
                filePath: spriteSheetPath,
                name: 'files',
                formData: {
                  'exercise_id': actionCategory.toString(),
                  'record_id': this.data.currentRecordId.toString(),
                  'elapsed_time': this.data.elapsedTime.toString(),
                  // 传递锁的状态给后端        
                  'is_waiting_for_feedback': this.isWaitingForFeedbackLock.toString()
                },
                success: (res) => {
                  if (res.statusCode === 201) {
                    console.log('Sprite sheet uploaded successfully.');
                    try {
                      const data = JSON.parse(res.data);
                      if (data && data.feedback) {
                        // 收到反馈，设置锁，并进行处理              
                        this.isWaitingForFeedbackLock = true;
                        this.handleRealtimeFeedback(data.feedback);
                      }
                    } catch (e) {
                      console.error('Error parsing feedback response:',
                        e);
                      this.isWaitingForFeedbackLock = false;
                    }
                  } else {
                    console.error(`Sprite sheet upload failed with status ${
res.statusCode}
:`,
                      res.data);
                    this.isWaitingForFeedbackLock = false;
                  }
                },
                fail: (err) => {
                  console.error('Sprite sheet upload failed (network):',
                    err);
                },
                complete: () => {
                  this.isWaitingForFeedbackLock = false;
                }
              });
            },
            handleRealtimeFeedback: (function () {
              let timeoutId = null;
              const debounceTime = 3000;
              return function (text) {
                if (timeoutId) {
                  clearTimeout(timeoutId);
                }
                timeoutId = setTimeout(() => {
                    if (!text || text.trim() === "") {
                      this.isWaitingForFeedbackLock = false;
                      return;
                    }
                    if (text.includes("未找到可分析的动作图片")) {
                      text = "请您跟着视频一起锻炼吧";
                    } else if (text.toLowerCase().includes("error") || text.includes("失败") || text.includes("错误")) {
                      console.error("Received error feedback from backend:",
                        text);
                      this.isWaitingForFeedbackLock = false;
                      return;
                      // 不显示不播报        
                    }
                    this.setData({
                      feedbackText: text
                    });
                    plugin.textToSpeech({
                      lang: "zh_CN",
                      tts: true,
                      content: text,
                      success: (res) => {
                        const innerAudioContext = wx.createInnerAudioContext();
                        innerAudioContext.autoplay = true;
                        innerAudioContext.src = res.filename;
                        innerAudioContext.onPlay(() => console.log('开始播放反馈语音'));
                        innerAudioContext.onError((res) => {
                          console.error('播放失败',
                            res.errMsg);
                          this.isWaitingForFeedbackLock = false;
                        });
                        innerAudioContext.onEnded(() => {
                          console.log('反馈语音播放结束');
                          this.isWaitingForFeedbackLock = false;
                          setTimeout(() => {
                              if (this.data.feedbackText === text) {
                                this.setData({
                                  feedbackText: ''
                                });
                              }
                            },
                            1500);
                        });
                      },
                      fail: (res) => {
                        console.error("语音合成失败",
                          res);
                        this.isWaitingForFeedbackLock = false;
                      }
                    });
                  },
                  debounceTime);
              };
            })(),

            onCameraError(e) {
              console.error('Camera error:',
                e.detail);
              wx.showModal({
                title: '摄像头异常',
                content: '无法访问摄像头，请检查权限设置或稍后重试。',
                showCancel: false,
                confirmText: '返回',
                success: (res) => {
                  if (res.confirm) this.returnToInitialStage();
                }
              });
            },
            onCameraStop() {
              console.warn('Camera stopped unexpectedly.');
              if (this.data.isTrainingStarted && !this.data.isPaused && this.data.isPositioned) {
                this.returnToInitialStage('摄像头异常中断。');
              }
            },
            handleHome() {
              wx.redirectTo({
                url: '/pages/home/home'
              });
            },
      }
    );