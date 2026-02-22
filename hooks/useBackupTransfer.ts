import React, { useRef, useState } from 'react';
import { importIndexedDBData } from '../services/storageService';

type AlertType = 'info' | 'success' | 'error' | 'warning';

type ShowAlert = (
  message: string,
  options?: {
    type?: AlertType;
    onConfirm?: () => void;
    showCancel?: boolean;
  }
) => void;

type ImportResult = { projects: number; assets: number };

interface BackupTransferMessages {
  invalidFileType?: string;
  exportSuccess?: string;
  exportError?: (error: unknown) => string;
  importConfirm?: (projectCount: number, assetCount: number) => string;
  importSuccess?: (result: ImportResult) => string;
  importError?: (error: unknown) => string;
}

interface UseBackupTransferOptions<TPayload = unknown> {
  exporter: () => Promise<TPayload>;
  exportFileName: (timestamp: string) => string;
  showAlert: ShowAlert;
  onImportSuccess?: (result: ImportResult) => Promise<void> | void;
  messages?: BackupTransferMessages;
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : '未知错误');

export function useBackupTransfer<TPayload = unknown>({
  exporter,
  exportFileName,
  showAlert,
  onImportSuccess,
  messages,
}: UseBackupTransferOptions<TPayload>) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [isDataExporting, setIsDataExporting] = useState(false);
  const [isDataImporting, setIsDataImporting] = useState(false);

  const handleExportData = async () => {
    if (isDataExporting) return;

    setIsDataExporting(true);
    try {
      const payload = await exporter();
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName(timestamp);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showAlert(messages?.exportSuccess || '导出完成，备份文件已下载。', { type: 'success' });
    } catch (error) {
      console.error('Export failed:', error);
      showAlert(
        messages?.exportError?.(error) || `导出失败: ${getErrorMessage(error)}`,
        { type: 'error' }
      );
    } finally {
      setIsDataExporting(false);
    }
  };

  const handleImportData = () => {
    if (isDataImporting) return;
    importInputRef.current?.click();
  };

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      showAlert(messages?.invalidFileType || '请选择 .json 备份文件。', { type: 'warning' });
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const projectCount = payload?.stores?.projects?.length || 0;
      const assetCount = payload?.stores?.assetLibrary?.length || 0;
      const confirmMessage =
        messages?.importConfirm?.(projectCount, assetCount) ||
        `将导入 ${projectCount} 个项目和 ${assetCount} 个资产。若 ID 冲突将覆盖现有数据。是否继续？`;

      showAlert(confirmMessage, {
        type: 'warning',
        showCancel: true,
        onConfirm: async () => {
          try {
            setIsDataImporting(true);
            const result = await importIndexedDBData(payload, { mode: 'merge' });
            await onImportSuccess?.(result);
            showAlert(
              messages?.importSuccess?.(result) ||
                `导入完成：项目 ${result.projects} 个，资产 ${result.assets} 个。`,
              { type: 'success' }
            );
          } catch (error) {
            console.error('Import failed:', error);
            showAlert(
              messages?.importError?.(error) || `导入失败: ${getErrorMessage(error)}`,
              { type: 'error' }
            );
          } finally {
            setIsDataImporting(false);
          }
        },
      });
    } catch (error) {
      console.error('Import failed:', error);
      showAlert(
        messages?.importError?.(error) || `导入失败: ${getErrorMessage(error)}`,
        { type: 'error' }
      );
    }
  };

  return {
    importInputRef,
    isDataExporting,
    isDataImporting,
    handleExportData,
    handleImportData,
    handleImportFileChange,
  };
}

