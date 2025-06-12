// index.js
Page({
  data: {
    isRecording: false,      // 是否正在录制
    actionLabel: '准备中...',  // 动作标签
    cameraContext: null,     // 摄像头上下文
    fs: null,                // 文件系统管理器
    mainTimer: null,         // 主定时器ID，用于 setInterval
    isBusy: false,           // 状态锁，防止在前一轮处理完成前开始新一轮采集
    // 【新增】用于图像处理的离屏Canvas
    spriteCanvas: null,
    spriteContext: null,
    // 【新增】专门用于压缩的Canvas
    compressionCanvas: null,
    compressionContext: null,
  },

  onReady: function () {
    this.setData({
      cameraContext: wx.createCameraContext(),
      fs: wx.getFileSystemManager(),
      // 在页面准备好时创建离屏Canvas
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
    this.setData({ isRecording: true, actionLabel: '准备采集...' });

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
    this.setData({ isRecording: false, actionLabel: '准备中...', mainTimer: null, isBusy: false });
    wx.showToast({ title: '训练已停止', icon: 'none' });
  },

  /**
   * 【步骤1】均匀采样，并将帧对象暂存到内存中 (此函数无改动)
   */
  captureAndCollectFrames: function() {
    const that = this;
    const cameraContext = this.data.cameraContext;
    const totalFrames = 8;
    const duration = 2000;
    const frameInterval = duration / totalFrames;
    let capturedFrames = [];
    let lastCaptureTime = 0;
    let listener = null;

    this.setData({ actionLabel: `准备采样 (0/${totalFrames})` });

    const stopListenerAndProcess = () => {
      if (listener) {
        listener.stop();
        listener = null;
        if (capturedFrames.length > 0) {
          that.createSpriteFromFrames(capturedFrames);
        } else {
          that.setData({ isBusy: false, actionLabel: '采样失败' });
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
        // that.setData({ actionLabel: `正在采样 (${capturedFrames.length}/${totalFrames})` });
      }
    });

    listener.start({
      success: () => console.log('帧监听器启动，开始采集帧...'),
      fail: (err) => {
        console.error('帧监听器启动失败', err);
        clearTimeout(safetyTimeout);
        that.setData({ isBusy: false, actionLabel: '启动失败' });
      }
    });
  },

  /**
   * 【步骤2: 重大改动】从内存中的帧创建雪碧图，并在写入磁盘前进行压缩
   * @param {object[]} frames - 包含所有帧数据对象的数组
   */
  createSpriteFromFrames: async function(frames) {
    const that = this;
    const { spriteCanvas, spriteContext, compressionCanvas, compressionContext } = this.data;
    const totalFrames = frames.length;
    const framesPerRow = 4;
    const COMPRESSION_HEIGHT = 400; // 目标压缩高度

    this.setData({ actionLabel: `正在压缩合成...` });
    
    try {
      // 从第一帧获取原始尺寸
      const firstFrame = frames[0];
      const originalWidth = firstFrame.width;
      const originalHeight = firstFrame.height;
      
      // 计算压缩后的尺寸，保持宽高比
      const aspectRatio = originalWidth / originalHeight;
      const compressedHeight = COMPRESSION_HEIGHT;
      const compressedWidth = Math.round(compressedHeight * aspectRatio);

      // 根据压缩后的尺寸，初始化最终的雪碧图Canvas
      spriteCanvas.width = compressedWidth * framesPerRow;
      spriteCanvas.height = compressedHeight * Math.ceil(totalFrames / framesPerRow);
      spriteContext.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
      console.log(`最终雪碧图Canvas尺寸: ${spriteCanvas.width}x${spriteCanvas.height}`);

      // 循环处理每一帧
      for(let i = 0; i < totalFrames; i++) {
        const frame = frames[i]; // 这是内存中的原始大尺寸帧

        // 步骤A: 将原始帧数据绘制到压缩Canvas上
        compressionCanvas.width = frame.width;
        compressionCanvas.height = frame.height;

        // 1. 创建 ImageData 对象
        const imgDataObj = compressionContext.createImageData(frame.width, frame.height);
        // 2. 赋值像素
        imgDataObj.data.set(new Uint8ClampedArray(frame.data));
        // 3. 绘制到 canvas
        compressionContext.putImageData(imgDataObj, 0, 0);

        // 步骤B: 从压缩Canvas生成一个压缩后的小尺寸临时文件
        const compressedPath = await new Promise((resolve, reject) => {
          wx.canvasToTempFilePath({
            canvas: compressionCanvas,
            destWidth: compressedWidth,   // 指定目标宽度进行压缩
            destHeight: compressedHeight, // 指定目标高度进行压缩
            fileType: 'jpg',
            quality: 0.7, // 较低的质量以获得更小的文件体积
            success: res => resolve(res.tempFilePath),
            fail: reject,
          });
        });
        
        // 步骤C: 加载这个压缩后的小文件到Image对象
        const image = spriteCanvas.createImage();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = compressedPath;
        });

        // 步骤D: 将压缩后的Image对象绘制到最终的雪碧图Canvas上
        const dx = (i % framesPerRow) * compressedWidth;
        const dy = Math.floor(i / framesPerRow) * compressedHeight;
        spriteContext.drawImage(image, dx, dy, compressedWidth, compressedHeight);

        // 步骤E: 立即删除已使用过的临时文件，释放空间
        this.data.fs.unlink({ filePath: compressedPath });
        console.log(`已压缩、绘制并删除第 ${i + 1} 帧`);
      }

      // 所有帧都绘制完毕，从雪碧图Canvas生成最终待上传的文件
      wx.canvasToTempFilePath({
        canvas: spriteCanvas,
        fileType: 'jpg', quality: 0.7,
        success: (res) => {
          console.log('最终雪碧图生成成功:', res.tempFilePath);
          that.uploadSprite(res.tempFilePath);
        },
        fail: (err) => {
          console.error('最终雪碧图生成失败', err);
          that.setData({ isBusy: false, actionLabel: '处理失败' });
        }
      });

    } catch(err) {
      console.error("创建雪碧图过程中出错: ", err);
      this.setData({ isBusy: false, actionLabel: '合成失败' });
    }
  },
  
  /**
   * 上传单张雪碧图 (此函数无改动)
   */
  uploadSprite: function(spritePath) {
    const that = this;
    const batchId = `sprite_${Date.now()}`;
    this.setData({ actionLabel: '正在上传...' });

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
        console.error('雪碧图上传失败', err);
        that.setData({ actionLabel: '上传失败' });
      },
      complete: () => {
        this.setData({ isBusy: false });
      }
    });
  },

  onHide: function () { this.stopTraining(); },
  onUnload: function () { this.stopTraining(); }
});