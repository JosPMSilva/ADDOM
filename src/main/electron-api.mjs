const electronModule = await import('electron')

function resolveElectronApi(name) {
  if (globalThis.__ADDOM_TEST_ELECTRON__ && Object.prototype.hasOwnProperty.call(globalThis.__ADDOM_TEST_ELECTRON__, name)) {
    return globalThis.__ADDOM_TEST_ELECTRON__[name]
  }
  return electronModule[name] ?? electronModule.default?.[name] ?? null
}

export const ipcMain = resolveElectronApi('ipcMain')
export const BrowserWindow = resolveElectronApi('BrowserWindow')
export const nativeTheme = resolveElectronApi('nativeTheme')
