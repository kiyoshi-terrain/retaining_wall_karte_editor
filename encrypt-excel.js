#!/usr/bin/env node
/**
 * Retaining Wall Karte Editor - Excel一括暗号化/復号スクリプト
 *
 * 使い方:
 *   暗号化:  node encrypt-excel.js encrypt <パスワード> <ファイル or フォルダ>
 *   復号:    node encrypt-excel.js decrypt <パスワード> <ファイル or フォルダ>
 *   検証:    node encrypt-excel.js verify  <パスワード> <ファイル>
 *
 * 例:
 *   node encrypt-excel.js encrypt 1234 "Demo New.xlsx"
 *   node encrypt-excel.js decrypt 1234 "Demo New.xlsx"
 *   node encrypt-excel.js encrypt 1234 ./xlsx_folder/
 *   node encrypt-excel.js verify  1234 "Demo New.xlsx"    ← 暗号化→復号の往復検証
 */

const XlsxPopulate = require('xlsx-populate');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================
// メイン処理
// ============================

async function main() {
  const [,, command, password, targetPath] = process.argv;

  if (!command || !password || !targetPath) {
    console.log('使い方:');
    console.log('  暗号化:  node encrypt-excel.js encrypt <パスワード> <ファイル or フォルダ>');
    console.log('  復号:    node encrypt-excel.js decrypt <パスワード> <ファイル or フォルダ>');
    console.log('  検証:    node encrypt-excel.js verify  <パスワード> <ファイル>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(targetPath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`エラー: ${resolvedPath} が見つかりません`);
    process.exit(1);
  }

  const stat = fs.statSync(resolvedPath);

  if (stat.isDirectory()) {
    // フォルダ内の.xlsxファイルを一括処理
    const files = fs.readdirSync(resolvedPath)
      .filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'))
      .map(f => path.join(resolvedPath, f));

    if (files.length === 0) {
      console.log('対象の.xlsxファイルが見つかりません');
      process.exit(0);
    }

    console.log(`\n${files.length}件のファイルを${command === 'encrypt' ? '暗号化' : '復号'}します...\n`);

    let success = 0, fail = 0;
    for (const file of files) {
      try {
        if (command === 'encrypt') {
          await encryptFile(file, password);
        } else if (command === 'decrypt') {
          await decryptFile(file, password);
        } else if (command === 'verify') {
          await verifyFile(file, password);
        }
        success++;
      } catch (e) {
        console.error(`  ❌ ${path.basename(file)}: ${e.message}`);
        fail++;
      }
    }

    console.log(`\n完了: ${success}件成功, ${fail}件失敗`);
  } else {
    // 単一ファイル
    if (command === 'encrypt') {
      await encryptFile(resolvedPath, password);
    } else if (command === 'decrypt') {
      await decryptFile(resolvedPath, password);
    } else if (command === 'verify') {
      await verifyFile(resolvedPath, password);
    } else {
      console.error(`不明なコマンド: ${command}`);
      process.exit(1);
    }
  }
}

// ============================
// 暗号化
// ============================

async function encryptFile(filePath, password) {
  const fileName = path.basename(filePath);

  // 既に暗号化されていないか確認
  if (await isAlreadyEncrypted(filePath, password)) {
    console.log(`  ⏭️  ${fileName} (既に暗号化済み、スキップ)`);
    return;
  }

  // xlsx-populateで読み込み → パスワード付きで出力
  const workbook = await XlsxPopulate.fromFileAsync(filePath);
  await workbook.toFileAsync(filePath, { password: password });

  console.log(`  🔒 ${fileName} → 暗号化完了`);
}

// ============================
// 復号
// ============================

async function decryptFile(filePath, password) {
  const fileName = path.basename(filePath);

  // 暗号化されているか確認
  if (!(await isAlreadyEncrypted(filePath, password))) {
    console.log(`  ⏭️  ${fileName} (暗号化されていません、スキップ)`);
    return;
  }

  // パスワードで読み込み → パスワードなしで出力
  const workbook = await XlsxPopulate.fromFileAsync(filePath, { password: password });
  await workbook.toFileAsync(filePath);

  console.log(`  🔓 ${fileName} → 復号完了`);
}

// ============================
// 往復検証（暗号化→復号でファイルが壊れないことを確認）
// ============================

async function verifyFile(filePath, password) {
  const fileName = path.basename(filePath);
  console.log(`\n🔍 検証開始: ${fileName}`);

  // 元ファイルを読み込み
  const originalBuffer = fs.readFileSync(filePath);
  const originalHash = hashBuffer(originalBuffer);
  const originalSize = originalBuffer.length;
  console.log(`  元ファイル: ${formatSize(originalSize)} (SHA-256: ${originalHash.slice(0, 16)}...)`);

  // Step 1: xlsx-populateで読み込み → パスワード付き出力
  console.log(`  Step 1: 暗号化中...`);
  const wb1 = await XlsxPopulate.fromDataAsync(originalBuffer);
  const encryptedBuffer = await wb1.outputAsync({ password: password, type: 'nodebuffer' });
  const encryptedSize = encryptedBuffer.length;
  console.log(`  暗号化後: ${formatSize(encryptedSize)}`);

  // Step 2: 暗号化ファイルをパスワードで読み込み → パスワードなし出力
  console.log(`  Step 2: 復号中...`);
  const wb2 = await XlsxPopulate.fromDataAsync(encryptedBuffer, { password: password });
  const decryptedBuffer = await wb2.outputAsync({ type: 'nodebuffer' });
  const decryptedSize = decryptedBuffer.length;
  const decryptedHash = hashBuffer(decryptedBuffer);
  console.log(`  復号後:   ${formatSize(decryptedSize)} (SHA-256: ${decryptedHash.slice(0, 16)}...)`);

  // Step 3: xlsx-populateパススルー（暗号化なし）のサイズも確認
  const wb3 = await XlsxPopulate.fromDataAsync(originalBuffer);
  const passthroughBuffer = await wb3.outputAsync({ type: 'nodebuffer' });
  const passthroughSize = passthroughBuffer.length;
  const passthroughHash = hashBuffer(passthroughBuffer);
  console.log(`  パススルー: ${formatSize(passthroughSize)} (SHA-256: ${passthroughHash.slice(0, 16)}...)`);

  // Step 4: 内容比較
  console.log(`\n  --- 比較結果 ---`);

  // xlsx-populateは内部XMLを再構築するのでバイト完全一致はしない
  // パススルーと復号後が一致すればOK（xlsx-populateの再構築による差分のみ）
  const passVsDecrypt = passthroughHash === decryptedHash;
  console.log(`  パススルー vs 復号後: ${passVsDecrypt ? '✅ 一致' : '⚠️  不一致'}`);

  const sizeDiff = Math.abs(originalSize - decryptedSize);
  const sizeRatio = (sizeDiff / originalSize * 100).toFixed(2);
  console.log(`  元 vs 復号後 サイズ差: ${formatSize(sizeDiff)} (${sizeRatio}%)`);

  // Step 5: シート構造・画像数の比較
  console.log(`\n  --- シート構造比較 ---`);
  const origWb = await XlsxPopulate.fromDataAsync(originalBuffer);
  const decWb = await XlsxPopulate.fromDataAsync(decryptedBuffer);

  const origSheets = origWb.sheets().map(s => s.name());
  const decSheets = decWb.sheets().map(s => s.name());
  console.log(`  元シート数:   ${origSheets.length} [${origSheets.join(', ')}]`);
  console.log(`  復号シート数: ${decSheets.length} [${decSheets.join(', ')}]`);
  console.log(`  シート構造: ${origSheets.join(',') === decSheets.join(',') ? '✅ 一致' : '❌ 不一致'}`);

  // 最終判定
  console.log(`\n  ${passVsDecrypt ? '✅ 検証成功: 暗号化→復号で内容が保持されています' : '⚠️  検証注意: パススルーと復号後でハッシュが異なります'}`);
}

// ============================
// ユーティリティ
// ============================

async function isAlreadyEncrypted(filePath, password) {
  try {
    // パスワードなしで開けるか試す
    await XlsxPopulate.fromFileAsync(filePath);
    return false; // 開けた → 暗号化されていない
  } catch (e) {
    try {
      // パスワード付きで開けるか試す
      await XlsxPopulate.fromFileAsync(filePath, { password: password });
      return true; // 開けた → 暗号化済み
    } catch (e2) {
      throw new Error('ファイルを開けません（パスワードが違う可能性）');
    }
  }
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// 実行
main().catch(e => {
  console.error('エラー:', e.message);
  process.exit(1);
});
