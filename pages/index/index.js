// index.js
Page({
  data: {
    isRecording: false,      // 是否正在录制
    actionLabel: '准备中...',  // 动作标签
    cameraContext: null,     // 摄像头上下文
    fs: null,                // 文件系统管理器
    mainTimer: null,         // 主定时器ID，用于 setInterval
    isBusy: false,           // 状态锁，防止在前一轮处理完成前开始新一轮采集
  },

  onReady: function () {
    this.setData({
      cameraContext: wx.createCameraContext(),
      fs: wx.getFileSystemManager()
    });
  },

  /**
   * 点击 "开始训练" 按钮
   */
  startTraining: function () {
    if (this.data.isRecording) return;

    console.log('训练开始，启动主定时器');
    this.setData({
      isRecording: true,
      actionLabel: '准备采集...'
    });

    // 创建一个每1.5秒执行一次的主定时器
    const timer = setInterval(() => {
      // 如果上一轮任务还未完成，则跳过本次循环
      if (this.data.isBusy) {
        console.log('系统繁忙，跳过本次采集周期');
        return;
      }
      this.setData({ isBusy: true });
      this.captureFrames();
    }, 1500); // 1.5秒间隔

    this.setData({ mainTimer: timer });
  },

  /**
   * 点击 "停止训练" 按钮
   */
  stopTraining: function () {
    if (!this.data.isRecording) return;
    
    console.log('训练停止，清除主定时器');
    // 清除定时器
    if (this.data.mainTimer) {
      clearInterval(this.data.mainTimer);
    }
    
    this.setData({
      isRecording: false,
      actionLabel: '准备中...',
      mainTimer: null,
      isBusy: false
    });
    
    wx.showToast({
      title: '训练已停止',
      icon: 'none'
    });
  },

  /**
   * 采集8帧图像
   */
  captureFrames: function () {
    const that = this;
    const cameraContext = this.data.cameraContext;
    let frames = []; // 临时存储采集到的帧
    const maxFrames = 8; // 目标采集帧数

    this.setData({ actionLabel: `正在采集 (0/${maxFrames})` });

    // 启动帧监听器
    const listener = cameraContext.onCameraFrame((frame) => {
      // 检查是否已采集足够帧数
      if (frames.length < maxFrames) {
        // 重要：必须复制帧数据，因为底层会复用 ArrayBuffer
        const buffer = new ArrayBuffer(frame.data.byteLength);
        new Uint8Array(buffer).set(new Uint8Array(frame.data));
        frames.push(buffer);
        
        that.setData({ actionLabel: `正在采集 (${frames.length}/${maxFrames})` });

        // 当采集到最后一帧时
        if (frames.length === maxFrames) {
          console.log('已采集8帧，停止监听');
          // 立即停止监听！这是性能优化的关键！
          listener.stop();
          // 开始处理和上传这些帧
          that.processAndUploadFrames(frames);
        }
      }
    });

    // 启动监听
    listener.start({
      success: () => {
        console.log('帧监听器启动成功，开始采集...');
      },
      fail: (err) => {
        console.error('帧监听器启动失败', err);
        that.setData({ isBusy: false, actionLabel: '启动失败' }); // 释放锁
      }
    });
  },
  
  /**
   * 处理并打包上传帧数据
   * @param {Array<ArrayBuffer>} frames - 包含8个帧数据的数组
   */
  processAndUploadFrames: async function (frames) {
    const that = this;
  const fs = this.data.fs;
  const tempDir = `${wx.env.USER_DATA_PATH}/temp_frames`;
  const zipFilePath = `${wx.env.USER_DATA_PATH}/frames.zip`;

  // 【重要】增加兼容性检查
  if (typeof fs.zip !== 'function') {
    wx.showModal({
      title: '环境错误',
      content: '当前微信版本过低，不支持压缩功能，请更新微信后重试。',
      showCancel: false
    });
    // 释放锁并更新状态
    this.setData({ isBusy: false, actionLabel: '环境不支持' });
    return; // 终止函数执行
  }

this.setData({ actionLabel: '正在处理图像...' });


    try {
      // 确保临时目录存在
      try {
        await fs.accessSync(tempDir);
        // 如果能访问，先清空目录内容（可选，但推荐）
        const files = await fs.readdirSync(tempDir);
        for(const file of files){
            await fs.unlinkSync(`${tempDir}/${file}`);
        }
      } catch (e) {
        // 目录不存在，创建它
        await fs.mkdirSync(tempDir, true);
      }

      // 1. 将所有帧数据并行写入临时文件
      const writePromises = frames.map((buffer, index) => {
        return new Promise((resolve, reject) => {
          const filePath = `${tempDir}/frame_${index}.jpg`;
          fs.writeFile({
            filePath: filePath,
            data: buffer,
            encoding: 'binary',
            success: resolve,
            fail: reject,
          });
        });
      });
      await Promise.all(writePromises);
      console.log('所有帧已写入临时文件');

      // 2. 将临时文件夹打包成 zip
      this.setData({ actionLabel: '正在压缩...' });
      await new Promise((resolve, reject) => {
        fs.zip({
          sourcePath: tempDir,
          targetPath: zipFilePath,
          success: resolve,
          fail: reject,
        });
      });
      console.log('文件压缩成功', zipFilePath);

      // 3. 上传 zip 文件
      this.setData({ actionLabel: '正在上传...' });
      wx.uploadFile({
        filePath: zipFilePath,
        name: 'frames_zip', // 后端接收文件的字段名
        url: 'https://481ir8ai2389.vicp.fun/test', // 你的后端地址
        success: (res) => {
          try {
            const responseData = JSON.parse(res.data);
            if (res.statusCode === 200 && responseData && responseData.label) {
              that.setData({ actionLabel: responseData.label });
            } else {
              that.setData({ actionLabel: '识别失败' });
            }
          } catch (e) {
            console.error('解析后端返回数据失败', e);
            that.setData({ actionLabel: '数据错误' });
          }
        },
        fail: (err) => {
          console.error('上传压缩包失败', err);
          that.setData({ actionLabel: '网络错误' });
        }
      });

    } catch (err) {
      console.error('处理或压缩文件失败', err);
      this.setData({ actionLabel: '处理失败' });
    } finally {
      // 4. 清理工作：删除临时文件和zip包
      fs.rmdir({
          dirPath: tempDir,
          recursive: true, // 递归删除文件夹内所有内容
          complete: () => console.log('临时帧文件夹已清理')
      });
      fs.unlink({
          filePath: zipFilePath,
          complete: () => console.log('临时zip包已清理')
      });
      // 释放锁，让下一个采集周期可以开始
      this.setData({ isBusy: false });
    }
  },

  /**
   * 页面隐藏/卸载时，停止所有活动
   */
  onHide: function () {
    this.stopTraining();
  },
  onUnload: function () {
    this.stopTraining();
  }
});