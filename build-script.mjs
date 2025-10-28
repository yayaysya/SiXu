import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

// 读取manifest.json获取版本号
const manifestPath = 'manifest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest.version;
const name = manifest.name || 'obsidian-notebook-llm';

// 构建配置
const buildDir = 'build';
const zipFileName = `${name}-v${version}.zip`;

// 需要拷贝的文件列表
const filesToCopy = [
  'main.js',
  'manifest.json',
  'styles.css'
];

console.log(`🚀 开始构建 ${name} v${version}...`);

// 清理并创建build目录
if (fs.existsSync(buildDir)) {
  fs.rmSync(buildDir, { recursive: true });
}
fs.mkdirSync(buildDir, { recursive: true });

// 拷贝文件到build目录
console.log('📁 拷贝文件到build目录...');
for (const file of filesToCopy) {
  const sourcePath = file;
  const destPath = path.join(buildDir, file);

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`  ✓ ${file}`);
  } else {
    console.error(`  ❌ 文件不存在: ${sourcePath}`);
    process.exit(1);
  }
}

// 创建ZIP文件
console.log('📦 创建ZIP包...');
const outputPath = path.join(process.cwd(), zipFileName);

const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const fileSize = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`✅ ZIP包创建成功!`);
  console.log(`📍 文件路径: ${outputPath}`);
  console.log(`📊 文件大小: ${fileSize} MB`);
  console.log(`📂 包含文件: ${filesToCopy.join(', ')}`);

  // 清理build目录
  fs.rmSync(buildDir, { recursive: true });
  console.log(`🧹 已清理build目录`);
});

archive.on('error', (err) => {
  console.error('❌ 创建ZIP包失败:', err);
  process.exit(1);
});

archive.pipe(output);

// 添加build目录中的所有文件到ZIP
archive.directory(buildDir, false);

archive.finalize();