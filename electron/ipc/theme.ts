/**
 * 系统主题 IPC
 * 职责：向渲染进程提供可靠的系统深浅色检测（基于 Electron nativeTheme），
 *       并在系统颜色模式变化时主动推送，供「跟随系统」主题实时生效。
 * 说明：nativeTheme 读取操作系统级配色偏好，比渲染层 matchMedia 更可靠
 *       （Electron 官方推荐方案），避免界面短时间显示错误配色。
 */
import { ipcMain, nativeTheme, BrowserWindow } from 'electron'

/**
 * 注册系统主题相关 IPC：
 *  - theme:get-system-dark：查询当前系统是否为深色模式
 *  - theme:system-changed：系统深浅色变化时向所有窗口推送最新状态
 */
export function registerThemeIpc(): void {
  // 查询当前系统是否为深色模式
  ipcMain.handle('theme:get-system-dark', () => nativeTheme.shouldUseDarkColors)

  // 系统深浅色发生变化（用户修改系统设置）时，向所有窗口推送，使「跟随系统」主题即时生效
  nativeTheme.on('updated', () => {
    const dark = nativeTheme.shouldUseDarkColors
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('theme:system-changed', dark)
    }
  })
}