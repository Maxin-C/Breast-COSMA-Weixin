// pages/progress/progress.js
Page({
  data: {
    markers: [],
    // 训练小结数据
    totalExerciseCount: '-', // 锻炼总次数
    averageDuration: '-',   // 平均时长 (格式化为 HH:MM)
    aiEvaluation: '-',      // AI动作评估
    qualityOfLife: '-',     // 生活质量
    
    // chartData (如果将来需要图表展示可以保留)
    chartData: [60, 85, 40, 75, 50, 90, 70, 45, 20, 30, 15, 25],

    userId: null // 用户ID，从缓存读取
  },

  onLoad: function () {
    const userId = wx.getStorageSync('user_id');
    if (userId) {
      this.setData({ userId: userId });
      this.fetchProgressData(userId);
      this.fetchHighlightedDates(userId);
    } else {
      wx.showToast({
        title: '用户未登录，无法获取数据',
        icon: 'none',
        duration: 2000
      });
      // 可以选择跳转回登录页
      // wx.redirectTo({ url: '/pages/login/login' });
    }
  },

  // 获取所有进度相关数据
  fetchProgressData: function(userId) {
    this.fetchTotalExerciseCount(userId);
    this.fetchAverageDurationAndAIEvaluation(userId); // Combined for efficiency
    this.fetchQualityOfLife(userId); 
  },

  // 获取需要高亮的日期 (日程记录)
  fetchHighlightedDates: function (userId) {
    wx.request({
      url: `http://localhost:8000/calendar_schedules/search`,
      method: 'GET',
      data: {
        field: 'user_id',
        value: userId
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.length > 0) {
          const markers = res.data.map(item => {
            // calendar_schedules 的 schedule_date 字段是 YYYY-MM-DD
            const [year, month, day] = item.schedule_date.split('-').map(Number);
            return {
              year: year,
              month: month,
              day: day,
              type: 'schedule', // 显示一个点
              text: item.event_details || '日程', // 显示事件详情作为文本
              style: 'color: #DCE6D0;'
            };
          });
          this.setData({ markers: markers });
        } else if (res.statusCode === 404 || (res.data && res.data.length === 0)) {
          console.log('未找到日程记录。');
          this.setData({ markers: [] });
        } else {
          console.error('获取日程记录失败:', res);
          wx.showToast({ title: '获取日程失败', icon: 'none' });
          this.setData({ markers: [] });
        }
      },
      fail: (err) => {
        console.error('日程记录请求失败:', err);
        wx.showToast({ title: '网络错误，无法获取日程', icon: 'none' });
        this.setData({ markers: [] });
      }
    });
  },

  // 获取锻炼总次数
  fetchTotalExerciseCount: function(userId) {
    wx.request({
      url: `http://localhost:8000/recovery_records/search`,
      method: 'GET',
      data: {
        field: 'user_id',
        value: userId
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.length > 0) {
          this.setData({
            totalExerciseCount: `${res.data.length}次`
          });
        } else if (res.statusCode === 404 || (res.data && res.data.length === 0)) {
          this.setData({ totalExerciseCount: '-' });
        } else {
          console.error('获取锻炼总次数失败:', res);
          wx.showToast({ title: '获取锻炼总次数失败', icon: 'none' });
          this.setData({ totalExerciseCount: '-' });
        }
      },
      fail: (err) => {
        console.error('锻炼总次数请求失败:', err);
        wx.showToast({ title: '网络错误，无法获取锻炼总次数', icon: 'none' });
        this.setData({ totalExerciseCount: '-' });
      }
    });
  },

  // 获取平均时长和AI动作评估 (需要链式请求)
  fetchAverageDurationAndAIEvaluation: function(userId) {
    let allRecordDetails = [];
    let recordIds = [];

    // Step 1: Get all recovery records for the user to get record_ids
    wx.request({
      url: `http://localhost:8000/recovery_records/search`,
      method: 'GET',
      data: {
        field: 'user_id',
        value: userId
      },
      success: (recordsRes) => {
        if (recordsRes.statusCode === 200 && recordsRes.data && recordsRes.data.length > 0) {
          recordIds = recordsRes.data.map(record => record.record_id);

          if (recordIds.length === 0) {
            this.setData({
              averageDuration: '-',
              aiEvaluation: '-'
            });
            return;
          }

          // Use Promise.all to fetch all details concurrently
          const detailRequests = recordIds.map(recordId => {
            return new Promise((resolve, reject) => {
              wx.request({
                url: `http://localhost:8000/recovery_record_details/search`,
                method: 'GET',
                data: {
                  field: 'record_id',
                  value: recordId
                },
                success: (detailRes) => {
                  if (detailRes.statusCode === 200 && detailRes.data) {
                    resolve(detailRes.data);
                  } else {
                    resolve([]); // Resolve with empty array if no details found for this record_id
                  }
                },
                fail: (err) => {
                  console.warn(`获取record_id ${recordId}的详情失败:`, err);
                  resolve([]); // Resolve to continue other requests
                }
              });
            });
          });

          Promise.all(detailRequests).then(results => {
            results.forEach(details => {
              allRecordDetails = allRecordDetails.concat(details);
            });

            if (allRecordDetails.length > 0) {
              // Calculate Average Duration
              let totalMinutes = 0;
              allRecordDetails.forEach(detail => {
                totalMinutes += detail.actual_duration_minutes || 0;
              });
              const avgMinutes = totalMinutes / allRecordDetails.length;
              const hours = Math.floor(avgMinutes / 60);
              const minutes = Math.round(avgMinutes % 60);
              this.setData({
                averageDuration: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
              });

              // Determine AI Evaluation (e.g., from the latest or aggregated)
              // Sort by completion_timestamp to get the latest
              allRecordDetails.sort((a, b) => {
                const dateA = new Date(a.completion_timestamp);
                const dateB = new Date(b.completion_timestamp);
                return dateA - dateB;
              });
              const latestDetail = allRecordDetails[allRecordDetails.length - 1];
              this.setData({
                aiEvaluation: latestDetail.brief_evaluation || '-' // Use brief_evaluation
              });

            } else {
              this.setData({
                averageDuration: '-',
                aiEvaluation: '-'
              });
            }
          }).catch(err => {
            console.error('Promise.all for record details failed:', err);
            this.setData({
              averageDuration: '-',
              aiEvaluation: '-'
            });
          });

        } else if (recordsRes.statusCode === 404 || (recordsRes.data && recordsRes.data.length === 0)) {
          this.setData({
            averageDuration: '-',
            aiEvaluation: '-'
          });
        } else {
          console.error('获取康复记录失败:', recordsRes);
          wx.showToast({ title: '获取锻炼详情失败', icon: 'none' });
          this.setData({
            averageDuration: '-',
            aiEvaluation: '-'
          });
        }
      },
      fail: (err) => {
        console.error('康复记录请求失败:', err);
        wx.showToast({ title: '网络错误，无法获取锻炼详情', icon: 'none' });
        this.setData({
          averageDuration: '-',
          aiEvaluation: '-'
        });
      }
    });
  },

  // 获取生活质量
  fetchQualityOfLife: function(userId) {
    wx.request({
      url: `http://localhost:8000/qols/search`,
      method: 'GET',
      data: {
        field: 'user_id',
        value: userId
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.length > 0) {
          // Sort by qol_id (assuming higher ID means newer, or add a timestamp field in QoL model)
          res.data.sort((a, b) => b.qol_id - a.qol_id); // Sort descending to get latest
          this.setData({
            qualityOfLife: res.data[0].level || '-'
          });
        } else if (res.statusCode === 404 || (res.data && res.data.length === 0)) {
          this.setData({ qualityOfLife: '-' });
        } else {
          console.error('获取生活质量失败:', res);
          wx.showToast({ title: '获取生活质量失败', icon: 'none' });
          this.setData({ qualityOfLife: '-' });
        }
      },
      fail: (err) => {
        console.error('生活质量请求失败:', err);
        wx.showToast({ title: '网络错误，无法获取生活质量', icon: 'none' });
        this.setData({ qualityOfLife: '-' });
      }
    });
  },

  onReady() {
    // 可以在这里动态计算导航栏高度以适配所有机型
    // 但为简化，本示例使用固定高度和flex布局
  },

  handleHome: function() {
    wx.navigateTo({
      url: '/pages/home/home' // 假设记录页面的路径
    });
  },

  handleStartTraining: function() {
    wx.navigateTo({
      url: '/pages/exercise/exercise' // 假设训练页面的路径
    });
  },

  handleConsult: function() {
    wx.navigateTo({
      url: '/pages/chat/chat' // 假设记录页面的路径
    });
  }
});