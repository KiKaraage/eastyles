import React, { useCallback, useRef, useState } from "react";
import { storageClient } from "../../services/storage/client";
import { ExportData } from "../../services/storage/schema";

const BackupRestore = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [fileToImport, setFileToImport] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportSuccess(null);
    try {
      const data = await storageClient.exportAll();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eastyles_backup_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportSuccess("Backup exported successfully!");
    } catch (error) {
      console.error("Failed to export data:", error);
      // TODO: Show user-friendly error message
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        setFileToImport(file);
        setShowConfirmDialog(true);
      }
    },
    [],
  );

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      setFileToImport(file);
      setShowConfirmDialog(true);
    }
  }, []);

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(true);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleImportConfirm = useCallback(async () => {
    if (!fileToImport) return;

    setImportError(null);
    setImportSuccess(null);
    setShowConfirmDialog(false);
    setIsImporting(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const importedData: ExportData = JSON.parse(
            e.target?.result as string,
          );
          await storageClient.importAll(importedData);
          setImportSuccess(
            `Successfully imported ${importedData.styles?.length || 0} styles and settings!`,
          );
        } catch (parseError) {
          setImportError("Invalid JSON file.");
          console.error("Failed to parse imported file:", parseError);
        }
      };
      reader.readAsText(fileToImport);
    } catch (error) {
      setImportError("Failed to import data.");
      console.error("Failed to import data:", error);
    } finally {
      setIsImporting(false);
      setFileToImport(null);
    }
  }, [fileToImport]);

  const handleImportCancel = useCallback(() => {
    setFileToImport(null);
    setShowConfirmDialog(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Clear the file input
    }
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Backup & Restore</h2>

      {/* Export Section */}
      <div className="card bg-base-200 shadow-md p-4">
        <h3 className="card-title">Export Data</h3>
        <p>Download a backup of your Eastyles data (settings and styles).</p>
        <div className="card-actions justify-end mt-4">
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="animate-spin h-4 w-4 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    className="opacity-25"
                    stroke="currentColor"
                    stroke-width="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Exporting...
              </>
            ) : (
              "Export Data"
            )}
          </button>
        </div>
        {exportSuccess && (
          <div className="alert alert-success mt-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{exportSuccess}</span>
          </div>
        )}
      </div>

      {/* Import Section */}
      <div className="card bg-base-200 shadow-md p-4">
        <h3 className="card-title">Import Data</h3>
        <p>
          Upload a backup file to restore your Eastyles data. This will
          overwrite existing data.
        </p>
        <div
          role="button"
          tabIndex={0}
          className={`mt-4 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer ${isDragging ? "border-primary" : "border-base-300"}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              fileInputRef.current?.click();
              e.preventDefault();
            }
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".json"
          />
          <p className="text-lg font-medium">
            Drag & Drop your backup file here, or click to select
          </p>
          <p className="text-sm text-base-content/70">(JSON format only)</p>
        </div>
        {importError && <p className="text-error mt-2">Error: {importError}</p>}
        {importSuccess && (
          <div className="alert alert-success mt-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{importSuccess}</span>
          </div>
        )}
        {isImporting && (
          <div className="alert alert-info mt-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="animate-spin h-5 w-5 text-current"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                className="opacity-25"
                stroke="currentColor"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>Importing data, please wait...</span>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Confirm Import</h3>
            <p className="py-4">
              Are you sure you want to import data? This will overwrite all your
              current settings and styles.
            </p>
            <div className="modal-action">
              <button className="btn btn-error" onClick={handleImportConfirm}>
                Confirm Overwrite
              </button>
              <button className="btn" onClick={handleImportCancel}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackupRestore;
