"use client";

import { useState } from "react";
import { CodeWorkspace } from "@/components/CodeWorkspace";
import { CommandPanel } from "@/components/CommandPanel";
import { DownloadPrompt } from "@/components/DownloadPrompt";
import { PreviewPanel } from "@/components/PreviewPanel";
import { TopBar } from "@/components/TopBar";
import { useCoderBuddy } from "@/hooks/useCoderBuddy";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Terminal, Code, Layout } from "lucide-react";

type WorkspaceTab = "code" | "activity";
type InspectorTab = "preview" | "plan";
type MobileTab = "prompt" | "code" | "preview";

export default function Home() {
  const buddy = useCoderBuddy();
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("code");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("preview");
  const [mobileTab, setMobileTab] = useState<MobileTab>("prompt");
  const [editorFontSize, setEditorFontSize] = useState(14);

  return (
    <main className="workspace-shell h-[100dvh] text-zinc-100 flex flex-col">
      <TopBar runState={buddy.runState} />

      <div className="flex-1 flex flex-col md:flex-row p-4 min-h-0 overflow-hidden relative gap-4 md:gap-0">
        {/* Mobile Layout */}
        <div className="w-full flex flex-col md:hidden flex-1 min-h-0">
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {mobileTab === "prompt" && (
              <CommandPanel
                prompt={buddy.prompt}
                runState={buddy.runState}
                loading={buddy.loading}
                sessionReady={Boolean(buddy.sessionId)}
                hasGeneratedProject={buddy.hasGeneratedProject}
                downloaded={buddy.downloaded}
                isProjectComplete={buddy.isProjectComplete}
                connectionError={buddy.connectionError}
                files={buddy.files}
                activePath={buddy.activePath}
                onPromptChange={buddy.setPrompt}
                onStart={() => void buddy.startGeneration()}
                onDownload={() => void buddy.downloadProject()}
                onClear={() => void buddy.clearProject()}
                onSelectFile={buddy.setActivePath}
              />
            )}
            {mobileTab === "code" && (
              <CodeWorkspace
                tab={workspaceTab}
                onTabChange={setWorkspaceTab}
                activeFile={buddy.activeFile}
                files={buddy.files}
                activePath={buddy.activePath}
                completedFiles={buddy.completedFiles}
                editorFontSize={editorFontSize}
                logs={buddy.logs}
                loading={buddy.loading}
                onEditorFontSizeChange={setEditorFontSize}
                onSelectFile={buddy.setActivePath}
                onRefresh={() => void buddy.refreshFiles(true)}
              />
            )}
            {mobileTab === "preview" && (
              <PreviewPanel
                tab={inspectorTab}
                onTabChange={setInspectorTab}
                previewSrc={buddy.previewSrc}
                hasGeneratedProject={buddy.hasGeneratedProject}
                projectSummary={buddy.projectSummary}
                steps={buddy.steps}
                files={buddy.files}
                onReload={buddy.reloadPreview}
                onOpenPreview={buddy.openPreview}
              />
            )}
          </div>
          
          {/* Bottom Navigation */}
          <div className="h-[60px] bg-[#0a0a0a] border-t border-zinc-800 flex items-center justify-around shrink-0 -mx-4 -mb-4 mt-4 px-2">
            <button 
              onClick={() => setMobileTab("prompt")}
              className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-colors ${mobileTab === 'prompt' ? 'text-cyan-400 bg-cyan-950/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
            >
              <Terminal className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Prompt</span>
            </button>
            <button 
              onClick={() => setMobileTab("code")}
              className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-colors ${mobileTab === 'code' ? 'text-cyan-400 bg-cyan-950/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
            >
              <Code className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Code</span>
            </button>
            <button 
              onClick={() => setMobileTab("preview")}
              className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-colors ${mobileTab === 'preview' ? 'text-cyan-400 bg-cyan-950/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
            >
              <Layout className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Preview</span>
            </button>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden md:flex w-full h-full min-h-0">
          <PanelGroup orientation="horizontal" id="coderbuddy-layout">
            <Panel defaultSize={25} minSize={15} className="flex flex-col min-h-0 min-w-0 overflow-hidden">
              <CommandPanel
                prompt={buddy.prompt}
                runState={buddy.runState}
                loading={buddy.loading}
                sessionReady={Boolean(buddy.sessionId)}
                hasGeneratedProject={buddy.hasGeneratedProject}
                downloaded={buddy.downloaded}
                isProjectComplete={buddy.isProjectComplete}
                connectionError={buddy.connectionError}
                files={buddy.files}
                activePath={buddy.activePath}
                onPromptChange={buddy.setPrompt}
                onStart={() => void buddy.startGeneration()}
                onDownload={() => void buddy.downloadProject()}
                onClear={() => void buddy.clearProject()}
                onSelectFile={buddy.setActivePath}
              />
            </Panel>
            
            <PanelResizeHandle className="w-4 relative flex items-center justify-center group cursor-col-resize">
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-zinc-800/50 group-hover:bg-blue-500 group-active:bg-blue-500 transition-colors" />
            </PanelResizeHandle>
            
            <Panel defaultSize={45} minSize={30} className="flex flex-col min-h-0 min-w-0 overflow-hidden">
              <CodeWorkspace
                tab={workspaceTab}
                onTabChange={setWorkspaceTab}
                activeFile={buddy.activeFile}
                files={buddy.files}
                activePath={buddy.activePath}
                completedFiles={buddy.completedFiles}
                editorFontSize={editorFontSize}
                logs={buddy.logs}
                loading={buddy.loading}
                onEditorFontSizeChange={setEditorFontSize}
                onSelectFile={buddy.setActivePath}
                onRefresh={() => void buddy.refreshFiles(true)}
              />
            </Panel>
            
            <PanelResizeHandle className="w-4 relative flex items-center justify-center group cursor-col-resize">
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-zinc-800/50 group-hover:bg-blue-500 group-active:bg-blue-500 transition-colors" />
            </PanelResizeHandle>
            
            <Panel defaultSize={30} minSize={20} className="flex flex-col min-h-0 min-w-0 overflow-hidden">
              <PreviewPanel
                tab={inspectorTab}
                onTabChange={setInspectorTab}
                previewSrc={buddy.previewSrc}
                hasGeneratedProject={buddy.hasGeneratedProject}
                projectSummary={buddy.projectSummary}
                steps={buddy.steps}
                files={buddy.files}
                onReload={buddy.reloadPreview}
                onOpenPreview={buddy.openPreview}
              />
            </Panel>
          </PanelGroup>
        </div>
      </div>

      {buddy.showDownloadPrompt ? (
        <DownloadPrompt
          onDownload={() => void buddy.downloadProject()}
          onReplace={() => void buddy.startGeneration(true)}
          onCancel={() => buddy.setShowDownloadPrompt(false)}
        />
      ) : null}
    </main>
  );
}
