import { useState, useEffect } from "react";
import {
  Panel,
  Badge,
  MetricDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ConfirmDialog,
} from "@/components/ui";
import { File, Folder, Plus, Trash2, Save, Edit3, FolderTree, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DecisionInspector } from "@/components/trace";
import type { TraceEvent } from "@/types/trace";

export default function FileManager() {
  const [fileTree, setFileTree] = useState<any[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("/var/log");
  const [directoryContents, setDirectoryContents] = useState<any[]>([]);
  const [storageInfo, setStorageInfo] = useState<any>(null);

  const [viewingFile, setViewingFile] = useState<any | null>(null);
  const [fileContentEdit, setFileContentEdit] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameNewName, setRenameNewName] = useState<string>("");
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<"FILE" | "DIRECTORY">("FILE");
  const [newFileName, setNewFileName] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [newPermissions] = useState("rw-r--r--");

  const [lastTraceEvent, setLastTraceEvent] = useState<TraceEvent | null>(null);

  const loadTree = async () => {
    try {
      const tree = await api.getFileTree();
      setFileTree(tree);
    } catch {
      // retain
    }
  };

  const loadDirectory = async (path: string) => {
    try {
      const contents = await api.getDirectory(path);
      setDirectoryContents(contents);
      setCurrentPath(path);
      setViewingFile(null);
    } catch {
      // retain
    }
  };

  const loadStorage = async () => {
    try {
      const s = await api.getStorageStats();
      setStorageInfo(s);
    } catch {
      setStorageInfo(null);
    }
  };

  useEffect(() => {
    loadTree();
    loadDirectory("/var/log");
    loadStorage();
  }, []);

  const handleOpenFile = async (fileObj: any) => {
    if (fileObj.type === "DIRECTORY") {
      loadDirectory(fileObj.path);
    } else {
      try {
        const fullDetail = await api.getFileContent(fileObj.path);
        setViewingFile(fullDetail);
        setFileContentEdit(fullDetail.content || "");
        if (fullDetail.trace_events?.length > 0) setLastTraceEvent(fullDetail.trace_events[0]);
      } catch {
        setViewingFile(fileObj);
        setFileContentEdit(fileObj.content || "");
      }
    }
  };

  const handleSaveContent = async () => {
    if (!viewingFile) return;
    setIsSaving(true);
    try {
      const res = await api.updateFileContent(viewingFile.path, fileContentEdit);
      setViewingFile({ ...viewingFile, content: fileContentEdit, size: fileContentEdit.length });
      if (res?.trace_events?.length > 0) setLastTraceEvent(res.trace_events[0]);
      loadDirectory(currentPath);
      loadTree();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDeletePath) return;
    try {
      const res = await api.deleteFile(confirmDeletePath);
      if (res?.trace_events?.length > 0) setLastTraceEvent(res.trace_events[0]);
      if (viewingFile?.path === confirmDeletePath) setViewingFile(null);
      loadDirectory(currentPath);
      loadTree();
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmDeletePath(null);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingPath || !renameNewName.trim()) return;
    try {
      const res = await api.renameFile(renamingPath, renameNewName.trim());
      if (res?.trace_events?.length > 0) setLastTraceEvent(res.trace_events[0]);
      setRenamingPath(null);
      setRenameNewName("");
      loadDirectory(currentPath);
      loadTree();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    try {
      const res = await api.createFile({
        name: newFileName.trim(),
        parent_path: currentPath,
        is_directory: createType === "DIRECTORY",
        content: createType === "FILE" ? newFileContent : undefined,
        permissions: newPermissions,
      });
      if (res?.trace_events?.length > 0) setLastTraceEvent(res.trace_events[0]);
      setIsCreateModalOpen(false);
      setNewFileName("");
      setNewFileContent("");
      loadDirectory(currentPath);
      loadTree();
    } catch (err) {
      console.error(err);
    }
  };

  const renderFileTree = (nodes: any[], depth = 0) => {
    return nodes.map((node) => {
      const isCurrent = node.path === currentPath;
      return (
        <div key={node.id || node.path}>
          <div
            onClick={() => (node.type === "DIRECTORY" ? loadDirectory(node.path) : handleOpenFile(node))}
            className={cn(
              "flex items-center gap-2 py-1.5 px-2 cursor-pointer rounded-[2px] font-mono text-xs transition-colors",
              isCurrent
                ? "bg-[#12271B]/60 text-[#4ADE80] border-l-2 border-l-[#3ECF72]"
                : "text-[#8B98A5] hover:bg-[#11161B] hover:text-[#E6EDF3]"
            )}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
          >
            {node.type === "DIRECTORY" ? (
              <Folder className={cn("w-3.5 h-3.5 shrink-0", isCurrent ? "text-[#3ECF72]" : "text-[#38BDF8]")} />
            ) : (
              <File className="w-3.5 h-3.5 text-[#53616E] shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
          </div>
          {node.children && renderFileTree(node.children, depth + 1)}
        </div>
      );
    });
  };

  const pathSegments = currentPath.split("/").filter(Boolean);

  return (
    <div className="flex flex-col gap-4 max-w-[1440px] mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C252C] pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#11161B] border border-[#25303A] text-[#8B98A5] rounded-[2px]">
              VFS-06
            </span>
            <FolderTree className="w-4 h-4 text-[#3ECF72]" />
            <h1 className="font-display text-xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase">
              Virtual File System &amp; Inode Explorer
            </h1>
          </div>
          <p className="font-mono text-[10px] text-[#8B98A5] tracking-widest uppercase">
            Sandboxed Directory Hierarchy • Inode Metadata Inspector • Zero Host Access
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="h-8 px-3.5 bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[#4ADE80] font-bold text-xs font-mono rounded-[2px] flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>NEW INODE</span>
        </button>
      </div>

      {/* Storage Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricDisplay label="ACTIVE DIRECTORY" value={currentPath} accent="cyan" />
        <MetricDisplay label="ENTRIES" value={directoryContents.length} unit="nodes" accent="green" />
        <MetricDisplay
          label="FILESYSTEM"
          value={storageInfo?.filesystem_type || "ext4"}
          unavailable={!storageInfo}
          accent="neutral"
        />
        <MetricDisplay
          label="STORAGE USED"
          value={storageInfo ? storageInfo.usage_percent : "—"}
          unit="%"
          unavailable={!storageInfo}
          progress={storageInfo?.usage_percent ?? 0}
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4">
          <Panel title="Virtual Inode Tree" code="TREE" className="min-h-[520px]" brackets>
            <div className="max-h-[470px] overflow-y-auto custom-scrollbar">{renderFileTree(fileTree)}</div>
          </Panel>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-4">
          <Panel
            title={`Directory Contents`}
            code="DIR"
            subtitle={currentPath}
            actions={
              <div className="flex items-center gap-1 font-mono text-[10px]">
                <button
                  onClick={() => loadDirectory("/")}
                  className="px-1.5 py-0.5 bg-[#11161B] border border-[#1C252C] text-[#38BDF8] rounded-[2px] cursor-pointer"
                >
                  /
                </button>
                {pathSegments.map((seg, i) => {
                  const p = "/" + pathSegments.slice(0, i + 1).join("/");
                  return (
                    <button
                      key={p}
                      onClick={() => loadDirectory(p)}
                      className="px-1.5 py-0.5 bg-[#11161B] border border-[#1C252C] text-[#8B98A5] hover:text-[#E6EDF3] rounded-[2px] cursor-pointer"
                    >
                      {seg}
                    </button>
                  );
                })}
              </div>
            }
            noPadding
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NAME</TableHead>
                  <TableHead>TYPE</TableHead>
                  <TableHead className="text-right">SIZE</TableHead>
                  <TableHead>PERMISSIONS</TableHead>
                  <TableHead>MODIFIED</TableHead>
                  <TableHead className="text-center">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {directoryContents.map((file) => (
                  <TableRow
                    key={file.id || file.path}
                    onClick={() => handleOpenFile(file)}
                    className={cn(
                      "cursor-pointer",
                      viewingFile?.path === file.path && "bg-[#12271B]/45 border-l-2 border-l-[#3ECF72]"
                    )}
                  >
                    <TableCell className="flex items-center gap-2 font-bold">
                      {file.type === "DIRECTORY" ? (
                        <Folder className="w-4 h-4 text-[#38BDF8]" />
                      ) : (
                        <File className="w-4 h-4 text-[#8B98A5]" />
                      )}
                      {file.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={file.type === "DIRECTORY" ? "cyan" : "gray"}>{file.type}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-[#8B98A5]">
                      {file.size > 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${file.size} B`}
                    </TableCell>
                    <TableCell className="text-[#38BDF8]">{file.permissions}</TableCell>
                    <TableCell className="text-[#8B98A5]">{file.modified}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setRenamingPath(file.path);
                            setRenameNewName(file.name);
                          }}
                          title="Rename"
                          className="text-[#53616E] hover:text-[#4ADE80] p-1 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDeletePath(file.path)}
                          title="Delete"
                          className="text-[#53616E] hover:text-[#F87171] p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {directoryContents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-[#53616E]">
                      EMPTY DIRECTORY
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Panel>

          {viewingFile && (
            <Panel
              title={`File Inspector & Editor // ${viewingFile.path}`}
              code="INODE"
              actions={
                <span className="font-mono text-[10px] text-[#38BDF8]">
                  Inode #{viewingFile.id || 104} · {viewingFile.permissions || "rw-r--r--"}
                </span>
              }
            >
              <div className="flex flex-col gap-2.5">
                <textarea
                  value={fileContentEdit}
                  onChange={(e) => setFileContentEdit(e.target.value)}
                  className="w-full h-40 bg-[#080B0D] border border-[#1C252C] p-3 text-xs font-mono text-[#E6EDF3] rounded-[2px] focus:outline-none focus:border-[#3ECF72] custom-scrollbar"
                />
                <div className="flex justify-between items-center font-mono">
                  <span className="text-[10px] text-[#53616E]">
                    Buffer size: {fileContentEdit.length} bytes
                  </span>
                  <button
                    onClick={handleSaveContent}
                    disabled={isSaving}
                    className="h-8 px-3.5 bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[#4ADE80] font-bold text-xs rounded-[2px] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? "WRITING..." : "COMMIT CHANGES"}</span>
                  </button>
                </div>
              </div>
            </Panel>
          )}

          {lastTraceEvent && (
            <DecisionInspector event={lastTraceEvent} stepNumber={1} totalSteps={1} />
          )}
        </div>
      </div>

      {/* Rename Modal */}
      {renamingPath && (
        <div className="fixed inset-0 bg-[#050708]/85 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0C1013] border border-[#2A3844] rounded-[2px] max-w-sm w-full p-5 shadow-2xl flex flex-col gap-3 font-mono text-xs aegis-brackets">
            <div className="flex items-center justify-between border-b border-[#1C252C] pb-2">
              <h3 className="font-bold text-[#E6EDF3] uppercase">Rename Node</h3>
              <button onClick={() => setRenamingPath(null)} className="text-[#53616E] hover:text-[#E6EDF3] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-[#8B98A5] break-all">{renamingPath}</p>
            <form onSubmit={handleRenameSubmit} className="flex flex-col gap-3">
              <input
                type="text"
                value={renameNewName}
                onChange={(e) => setRenameNewName(e.target.value)}
                required
                className="h-8 bg-[#080B0D] border border-[#1C252C] px-2.5 text-[#E6EDF3] rounded-[2px]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenamingPath(null)}
                  className="h-7 px-3 bg-[#11161B] border border-[#1C252C] text-[#8B98A5] rounded-[2px] cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="h-7 px-4 bg-[#12271B] border border-[#265438] text-[#4ADE80] font-bold rounded-[2px] cursor-pointer"
                >
                  RENAME
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-[#050708]/85 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0C1013] border border-[#2A3844] rounded-[2px] max-w-md w-full p-5 shadow-2xl flex flex-col gap-4 font-mono text-xs aegis-brackets">
            <div className="flex items-center justify-between border-b border-[#1C252C] pb-2">
              <h2 className="font-bold text-[#E6EDF3] uppercase tracking-wider">Create Virtual Inode</h2>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-[#53616E] hover:text-[#E6EDF3] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCreateType("FILE")}
                  className={`flex-1 h-8 rounded-[2px] border cursor-pointer ${
                    createType === "FILE"
                      ? "bg-[#12271B] border-[#265438] text-[#4ADE80] font-bold"
                      : "border-[#1C252C] text-[#8B98A5]"
                  }`}
                >
                  FILE
                </button>
                <button
                  type="button"
                  onClick={() => setCreateType("DIRECTORY")}
                  className={`flex-1 h-8 rounded-[2px] border cursor-pointer ${
                    createType === "DIRECTORY"
                      ? "bg-[#0F2430] border-[#1E4B63] text-[#38BDF8] font-bold"
                      : "border-[#1C252C] text-[#8B98A5]"
                  }`}
                >
                  DIRECTORY
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#8B98A5]">NODE NAME</label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="e.g. system_audit.log"
                  required
                  className="h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2.5 text-[#E6EDF3]"
                />
              </div>

              {createType === "FILE" && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[#8B98A5]">INITIAL CONTENT</label>
                  <textarea
                    value={newFileContent}
                    onChange={(e) => setNewFileContent(e.target.value)}
                    rows={4}
                    className="bg-[#080B0D] border border-[#1C252C] rounded-[2px] p-2.5 text-[#E6EDF3]"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 mt-2 pt-3 border-t border-[#1C252C]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="h-8 px-3 bg-[#11161B] border border-[#1C252C] text-[#8B98A5] rounded-[2px] cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="h-8 px-4 bg-[#12271B] border border-[#265438] text-[#4ADE80] font-bold rounded-[2px] cursor-pointer"
                >
                  CREATE NODE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDeletePath)}
        title="Delete Virtual Inode"
        description={`Confirm permanent deletion of '${confirmDeletePath}' from the simulated virtual filesystem.`}
        confirmLabel="DELETE NODE"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmDeletePath(null)}
      />
    </div>
  );
}
