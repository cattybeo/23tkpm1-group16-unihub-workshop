import cron from 'node-cron'
import { importLatestNightlyStudents } from '../services/csv.service.js'

export function initCronJobs(): void {
  cron.schedule('0 2 * * *', async () => {
    console.log('[cron] CSV nightly import bắt đầu')
    try {
      const result = await importLatestNightlyStudents()
      console.log('[cron] CSV import xong:', result)
    } catch (err) {
      console.error('[cron] CSV import lỗi:', err)
    }
  }, { timezone: 'Asia/Ho_Chi_Minh' })
}
