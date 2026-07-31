//! mindgrid-file CLI — .mgd 文件格式命令行工具（spec 17）。
//!
//! 用法：
//!   mindgrid-file inspect  <file.mgd>              打印文档摘要与资源清单
//!   mindgrid-file validate <file.mgd>              运行 Level 0-4 完整性校验
//!   mindgrid-file extract  <file.mgd> <output_dir> 解压 .mgd 到目录
//!   mindgrid-file repair   <input.mgd> <output.mgd> 修复并输出新副本
//!   mindgrid-file migrate  <input.mgd> <output.mgd> 迁移到当前格式
//!   mindgrid-file pack     <input_dir> <output.mgd> 将目录打包为 .mgd
//!
//! 构建方式：cargo build --features cli --bin mindgrid-file

use mindgrid_lib::app::persistence::{
    self, read_document_archive_full, repair_document_file_with_report, validate_archive_integrity,
};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use std::process::ExitCode;
use zip::{CompressionMethod, ZipArchive, ZipWriter};
use zip::write::FileOptions;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        print_usage();
        return ExitCode::from(1);
    }

    let result = match args[1].as_str() {
        "inspect" => cmd_inspect(&args[2..]),
        "validate" => cmd_validate(&args[2..]),
        "extract" => cmd_extract(&args[2..]),
        "repair" => cmd_repair(&args[2..]),
        "migrate" => cmd_migrate(&args[2..]),
        "pack" => cmd_pack(&args[2..]),
        "--help" | "-h" | "help" => {
            print_usage();
            Ok(())
        }
        other => Err(format!("未知命令: {other}")),
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("错误: {message}");
            ExitCode::from(1)
        }
    }
}

fn print_usage() {
    eprintln!("mindgrid-file — MindGrid .mgd 文件格式工具");
    eprintln!();
    eprintln!("用法:");
    eprintln!("  mindgrid-file inspect  <file.mgd>                打印文档摘要与资源清单");
    eprintln!("  mindgrid-file validate <file.mgd>                运行 Level 0-4 完整性校验");
    eprintln!("  mindgrid-file extract  <file.mgd> <output_dir>   解压 .mgd 到目录");
    eprintln!("  mindgrid-file repair   <input.mgd> <output.mgd>  修复并输出新副本");
    eprintln!("  mindgrid-file migrate  <input.mgd> <output.mgd>  迁移到当前格式");
    eprintln!("  mindgrid-file pack     <input_dir> <output.mgd>  将目录打包为 .mgd");
}

fn require_arg<'a>(args: &'a [String], index: usize, name: &str) -> Result<&'a str, String> {
    args.get(index)
        .map(String::as_str)
        .ok_or_else(|| format!("缺少参数: <{name}>"))
}

/// inspect <file.mgd>
fn cmd_inspect(args: &[String]) -> Result<(), String> {
    let path = require_arg(args, 0, "file.mgd")?;
    let contents = read_document_archive_full(Path::new(path))?;
    let doc = &contents.document;
    let summary = doc.summary();

    println!("=== 文档摘要 ===");
    println!("  文档 ID:    {}", summary.document_id);
    println!("  修订版本:   {}", summary.revision);
    println!("  活动画布:   {}", summary.active_sheet_id);
    println!("  画布数:     {}", summary.sheet_count);
    println!("  主题数:     {}", summary.topic_count);
    println!("  根主题:     {}", summary.root_topic_text);
    println!("  Schema:     {}", doc.schema_version);

    println!();
    println!("=== 元数据 ===");
    println!("  标题:       {}", contents.metadata.title);
    println!("  作者:       {}", contents.metadata.author.as_deref().unwrap_or("—"));
    println!("  创建时间:   {}", contents.metadata.created_at_ms);
    println!("  修改时间:   {}", contents.metadata.modified_at_ms);
    println!("  应用版本:   {}", contents.metadata.app_version);

    println!();
    println!("=== 资源 ===");
    if contents.assets.index.assets.is_empty() {
        println!("  （无资源）");
    } else {
        for entry in &contents.assets.index.assets {
            println!(
                "  {} [{}] {} bytes, {}x{}",
                entry.asset_id,
                entry.mime_type,
                entry.byte_size,
                entry.width.map(|w| w.to_string()).unwrap_or("—".into()),
                entry.height.map(|h| h.to_string()).unwrap_or("—".into()),
            );
        }
    }

    println!();
    println!("=== 样式 ===");
    match &contents.styles {
        Some(styles) => println!(
            "  {}",
            serde_json::to_string_pretty(styles).map_err(|e| format!("样式序列化失败: {e}"))?
        ),
        None => println!("  （无样式）"),
    }

    Ok(())
}

/// validate <file.mgd>
fn cmd_validate(args: &[String]) -> Result<(), String> {
    let path = require_arg(args, 0, "file.mgd")?;

    print!("校验中... ");
    let _ = std::io::stdout().flush();

    validate_archive_integrity(Path::new(path))?;
    println!("通过");

    println!();
    println!("完整性校验 Level 0-4 全部通过：");
    println!("  Level 0 容器:   ZIP 结构有效，必要条目存在");
    println!("  Level 1 语法:   JSON 可解析");
    println!("  Level 2 结构:   必填字段存在");
    println!("  Level 3 语义:   ID 唯一，引用有效");
    println!("  Level 4 Hash:   资源 SHA-256 校验一致");

    Ok(())
}

/// extract <file.mgd> <output_dir>
fn cmd_extract(args: &[String]) -> Result<(), String> {
    let archive_path = require_arg(args, 0, "file.mgd")?;
    let output_dir = require_arg(args, 1, "output_dir")?;

    let file = File::open(archive_path).map_err(|e| format!("无法打开文件: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("无效的 ZIP: {e}"))?;

    fs::create_dir_all(output_dir).map_err(|e| format!("无法创建输出目录: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("无法读取条目 {i}: {e}"))?;
        let name = entry.name().to_string();

        // Zip Slip 防护
        if name.starts_with('/') || name.contains("..") {
            return Err(format!("条目 {name} 包含非法路径"));
        }

        let out_path = Path::new(output_dir).join(&name);
        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| format!("无法创建目录 {name}: {e}"))?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("无法创建父目录: {e}"))?;
            }
            let mut out_file = File::create(&out_path)
                .map_err(|e| format!("无法创建文件 {name}: {e}"))?;
            let mut bytes = Vec::new();
            entry
                .read_to_end(&mut bytes)
                .map_err(|e| format!("无法读取条目 {name}: {e}"))?;
            out_file
                .write_all(&bytes)
                .map_err(|e| format!("无法写入文件 {name}: {e}"))?;
        }
        println!("  提取: {name}");
    }

    println!("已提取 {} 个条目到 {}", archive.len(), output_dir);
    Ok(())
}

/// repair <input.mgd> <output.mgd>
fn cmd_repair(args: &[String]) -> Result<(), String> {
    let input = require_arg(args, 0, "input.mgd")?;
    let output = require_arg(args, 1, "output.mgd")?;

    println!("修复中...");
    let outcome = repair_document_file_with_report(Path::new(input), Path::new(output))?;

    println!("修复完成，已写入: {output}");
    println!("修复时间: {}", outcome.repaired_at_ms);
    println!("修复操作:");
    for change in &outcome.changes {
        println!("  - {change}");
    }

    Ok(())
}

/// migrate <input.mgd> <output.mgd>
fn cmd_migrate(args: &[String]) -> Result<(), String> {
    let input = require_arg(args, 0, "input.mgd")?;
    let output = require_arg(args, 1, "output.mgd")?;

    // 读取（自动迁移到当前 schema）
    let document = persistence::read_document_archive(Path::new(input))?;
    println!("已加载文档 (schema {})", document.schema_version);

    // 写入新格式
    let timestamp = persistence::current_timestamp_ms();
    persistence::write_document_archive(&document, Path::new(output), timestamp)?;

    println!("已迁移到格式 {}，写入: {output}", document.schema_version);
    Ok(())
}

/// pack <input_dir> <output.mgd>
fn cmd_pack(args: &[String]) -> Result<(), String> {
    let input_dir = require_arg(args, 0, "input_dir")?;
    let output = require_arg(args, 1, "output.mgd")?;

    let input_path = Path::new(input_dir);
    if !input_path.is_dir() {
        return Err(format!("输入路径不是目录: {input_dir}"));
    }

    let file = File::create(output).map_err(|e| format!("无法创建输出文件: {e}"))?;
    let mut writer = ZipWriter::new(file);
    let stored = FileOptions::default().compression_method(CompressionMethod::Stored);
    let deflated = FileOptions::default().compression_method(CompressionMethod::Deflated);

    let mut count = 0;
    pack_directory(input_path, input_path, &mut writer, stored, deflated, &mut count)?;

    writer
        .finish()
        .map_err(|e| format!("无法完成 ZIP 写入: {e}"))?;

    println!("已打包 {count} 个文件到: {output}");
    Ok(())
}

fn pack_directory(
    root: &Path,
    current: &Path,
    writer: &mut ZipWriter<File>,
    stored: FileOptions,
    deflated: FileOptions,
    count: &mut usize,
) -> Result<(), String> {
    let entries = fs::read_dir(current).map_err(|e| format!("无法读取目录: {e}"))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("无法读取目录条目: {e}"))?;
        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .map_err(|e| format!("路径剥离失败: {e}"))?;
        let name = relative.to_string_lossy().replace('\\', "/");

        if path.is_dir() {
            // 跳过空目录（ZIP 不需要显式目录条目）
            pack_directory(root, &path, writer, stored, deflated, count)?;
        } else {
            // mimetype 条目用 Stored
            let options = if name == "mimetype" { stored } else { deflated };
            writer
                .start_file(&name, options)
                .map_err(|e| format!("无法写入条目 {name}: {e}"))?;

            let mut file = File::open(&path).map_err(|e| format!("无法打开文件 {name}: {e}"))?;
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes)
                .map_err(|e| format!("无法读取文件 {name}: {e}"))?;
            writer
                .write_all(&bytes)
                .map_err(|e| format!("无法写入内容 {name}: {e}"))?;

            println!("  打包: {name}");
            *count += 1;
        }
    }

    Ok(())
}
