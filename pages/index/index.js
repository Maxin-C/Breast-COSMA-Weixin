// index.js
Page({
  data: {
    isRecording: false,      // 是否正在录制
    isPaused: false,         // 是否已暂停
    actionLabel: '准备中...',  // 动作标签
    cameraContext: null,     // 摄像头上下文
    fs: null,                // 文件系统管理器
    mainTimer: null,         // 主定时器ID，用于 setInterval
    isBusy: false,           // 状态锁，防止在前一轮处理完成前开始新一轮采集
    spriteCanvas: null,
    spriteContext: null,
    compressionCanvas: null,
    compressionContext: null,
  },

  onReady: function () {
    this.setData({
      cameraContext: wx.createCameraContext(),
      fs: wx.getFileSystemManager(),
      spriteCanvas: wx.createOffscreenCanvas({type: '2d'}),
      compressionCanvas: wx.createOffscreenCanvas({type: '2d'}),
    }, () => {
      this.setData({
        spriteContext: this.data.spriteCanvas.getContext('2d'),
        compressionContext: this.data.compressionCanvas.getContext('2d'),
      });
    });
  },

  startTraining: function () {
    if (this.data.isRecording) return;
    console.log('训练开始，启动主定时器');
    this.setData({ isRecording: true, isPaused: false });

    const timer = setInterval(() => {
      if (this.data.isBusy) {
        console.log('系统繁忙，跳过本次采集周期');
        return;
      }
      this.setData({ isBusy: true });
      this.captureAndCollectFrames(); 
    }, 1500);
    this.setData({ mainTimer: timer });
  },

  stopTraining: function () {
    if (!this.data.isRecording) return;
    console.log('训练停止，清除主定时器');
    if (this.data.mainTimer) clearInterval(this.data.mainTimer);
    this.setData({
        isRecording: false,
        isPaused: false, 
        actionLabel: '准备中...',
        mainTimer: null,
        isBusy: false
    });
    wx.showToast({ title: '训练已停止', icon: 'none' });
  },
  
  handlePauseToggle: function() {
    if (!this.data.isRecording) return; 

    if (this.data.isPaused) {
      console.log('训练继续');
      this.setData({ isPaused: false });
      
      const timer = setInterval(() => {
        if (this.data.isBusy) {
          console.log('系统繁忙，跳过本次采集周期');
          return;
        }
        this.setData({ isBusy: true });
        this.captureAndCollectFrames();
      }, 1500);
      this.setData({ mainTimer: timer });

    } else {
      console.log('训练暂停');
      if (this.data.mainTimer) {
        clearInterval(this.data.mainTimer);
      }
      this.setData({
        isPaused: true,
        actionLabel: '训练已暂停',
        mainTimer: null,
        isBusy: false 
      });
    }
  },

  handlePauseToggle: function() {
    if (!this.data.isRecording) return; 

    if (this.data.isPaused) {
      // --- 当前是暂停状态，点击“继续” ---
      console.log('训练继续');
      // 【修改】根据您的最新要求，在继续时立即将标签更新为“识别中”
      this.setData({ 
        isPaused: false,
        actionLabel: '识别中...' 
      });
      
      const timer = setInterval(() => {
        if (this.data.isBusy) {
          console.log('系统繁忙，跳过本次采集周期');
          return;
        }
        this.setData({ isBusy: true });
        this.captureAndCollectFrames();
      }, 1500);
      this.setData({ mainTimer: timer });

    } else {
      // --- 当前是运行状态，点击“暂停” ---
      console.log('训练暂停');
      if (this.data.mainTimer) {
        clearInterval(this.data.mainTimer);
      }
      this.setData({
        isPaused: true,
        actionLabel: '训练已暂停',
        mainTimer: null,
        isBusy: false 
      });
    }
  },

  handleTerminate: function() {
    if (!this.data.isRecording) return;

    wx.showModal({
      title: '确认',
      content: '您确定要终止当前训练吗？',
      success: (res) => {
        if (res.confirm) {
          console.log('用户确认终止');
          this.stopTraining();
          wx.navigateBack({ delta: 1 });
        } else if (res.cancel) {
          console.log('用户取消终止');
        }
      }
    });
  },

  captureAndCollectFrames: function() {
    const that = this;
    const cameraContext = this.data.cameraContext;
    const totalFrames = 8;
    const duration = 2000;
    const frameInterval = duration / totalFrames;
    let capturedFrames = [];
    let lastCaptureTime = 0;
    let listener = null;

    const stopListenerAndProcess = () => {
      if (listener) {
        listener.stop();
        listener = null;
        if (capturedFrames.length > 0) {
          that.createSpriteFromFrames(capturedFrames);
        } else {
          if (!that.data.isPaused) {
            that.setData({ actionLabel: '采样失败' });
          }
          that.setData({ isBusy: false });
        }
      }
    };
    
    const safetyTimeout = setTimeout(stopListenerAndProcess, duration + 300);

    listener = cameraContext.onCameraFrame((frame) => {
      if (capturedFrames.length >= totalFrames) {
        clearTimeout(safetyTimeout);
        stopListenerAndProcess();
        return;
      }
      const currentTime = Date.now();
      if (currentTime - lastCaptureTime >= frameInterval) {
        lastCaptureTime = currentTime;
        const frameCopy = {
            data: frame.data.slice(0),
            width: frame.width,
            height: frame.height,
        };
        capturedFrames.push(frameCopy);
      }
    });

    listener.start({
      success: () => console.log('帧监听器启动，开始采集帧...'),
      fail: (err) => {
        console.error('帧监听器启动失败', err);
        clearTimeout(safetyTimeout);
        if (!that.data.isPaused) {
          that.setData({ actionLabel: '启动失败' });
        }
        that.setData({ isBusy: false });
      }
    });
  },

  createSpriteFromFrames: async function(frames) {
    const that = this;
    const { spriteCanvas, spriteContext, compressionCanvas, compressionContext } = this.data;
    const totalFrames = frames.length;
    const framesPerRow = 4;
    const COMPRESSION_HEIGHT = 400;
    
    try {
      const firstFrame = frames[0];
      const originalWidth = firstFrame.width;
      const originalHeight = firstFrame.height;
      
      const aspectRatio = originalWidth / originalHeight;
      const compressedHeight = COMPRESSION_HEIGHT;
      const compressedWidth = Math.round(compressedHeight * aspectRatio);

      spriteCanvas.width = compressedWidth * framesPerRow;
      spriteCanvas.height = compressedHeight * Math.ceil(totalFrames / framesPerRow);
      spriteContext.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);

      for(let i = 0; i < totalFrames; i++) {
        const frame = frames[i];
        compressionCanvas.width = frame.width;
        compressionCanvas.height = frame.height;
        const imgDataObj = compressionContext.createImageData(frame.width, frame.height);
        imgDataObj.data.set(new Uint8ClampedArray(frame.data));
        compressionContext.putImageData(imgDataObj, 0, 0);

        const compressedPath = await new Promise((resolve, reject) => {
          wx.canvasToTempFilePath({
            canvas: compressionCanvas,
            destWidth: compressedWidth, destHeight: compressedHeight,
            fileType: 'jpg', quality: 0.7,
            success: res => resolve(res.tempFilePath),
            fail: reject,
          });
        });
        
        const image = spriteCanvas.createImage();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = compressedPath;
        });

        const dx = (i % framesPerRow) * compressedWidth;
        const dy = Math.floor(i / framesPerRow) * compressedHeight;
        spriteContext.drawImage(image, dx, dy, compressedWidth, compressedHeight);

        this.data.fs.unlink({ filePath: compressedPath });
      }

      wx.canvasToTempFilePath({
        canvas: spriteCanvas,
        fileType: 'jpg', quality: 0.7,
        success: (res) => {
          that.uploadSprite(res.tempFilePath);
        },
        fail: (err) => {
          console.error('最终雪碧图生成失败', err);
          // 【修改】添加 isPaused 状态检查
          if (!that.data.isPaused) {
            that.setData({ actionLabel: '处理失败' });
          }
          that.setData({ isBusy: false }); // 确保在失败时也释放锁
        }
      });

    } catch(err) {
      console.error("创建雪碧图过程中出错: ", err);
      // 【修改】添加 isPaused 状态检查
      if (!this.data.isPaused) {
        this.setData({ actionLabel: '合成失败' });
      }
      this.setData({ isBusy: false }); // 确保在失败时也释放锁
    }
  },
  
  uploadSprite: function(spritePath) {
    const that = this;
    const batchId = `sprite_${Date.now()}`;

    wx.uploadFile({
      url: 'https://481ir8ai2389.vicp.fun/test',
      filePath: spritePath,
      name: 'sprite_image',
      formData: {
        batchId: batchId,
        frames: 8,
        layout: '4x2'
      },
      success: (res) => {
        // 【修改】添加 isPaused 状态检查
        if (that.data.isPaused) {
          console.log('已暂停，忽略本次上传成功结果');
          return;
        }

        if (res.statusCode === 200) {
          try {
            const responseData = JSON.parse(res.data);
            that.setData({ actionLabel: responseData.label || '识别完成' });
          } catch(e) {
            that.setData({ actionLabel: '数据错误' });
          }
        } else {
          that.setData({ actionLabel: `服务器错误(${res.statusCode})` });
        }
      },
      fail: (err) => {
        // 【修改】添加 isPaused 状态检查
        if (that.data.isPaused) {
          console.log('已暂停，忽略本次上传失败结果');
          return;
        }
        console.error('雪碧图上传失败', err);
        that.setData({ actionLabel: '上传失败' });
      },
      complete: () => {
        // 这里的 isBusy 释放是安全的，因为它在 success/fail 逻辑之后执行
        this.setData({ isBusy: false });
      }
    });
  },

  onHide: function () { this.stopTraining(); },
  onUnload: function () { this.stopTraining(); }
});