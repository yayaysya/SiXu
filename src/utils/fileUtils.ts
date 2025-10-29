import { App } from 'obsidian';

/**
 * 确保目录存在，支持多级目录创建
 * @param app Obsidian App 实例
 * @param dirPath 目录路径，例如 'folder1/folder2/folder3'
 */
export async function ensureDirectory(app: App, dirPath: string): Promise<void> {
	if (!dirPath || dirPath.trim() === '') {
		// 空路径表示根目录，无需创建
		return;
	}

	const parts = dirPath.split('/').filter(part => part.length > 0);
	let currentPath = '';

	for (const part of parts) {
		currentPath = currentPath ? `${currentPath}/${part}` : part;

		try {
			const exists = await app.vault.adapter.exists(currentPath);
			if (!exists) {
				await app.vault.createFolder(currentPath);
			}
		} catch (error) {
			console.error(`Failed to create directory ${currentPath}:`, error);
			throw error;
		}
	}
}
