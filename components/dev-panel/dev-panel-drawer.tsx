"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Code2,
  Database,
  PlusCircle,
  Trash2,
  Bug,
  Wrench,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { GenerateTab } from "./tabs/generate-tab";
import { QuickAddTab } from "./tabs/quick-add-tab";
import { CleanupTab } from "./tabs/cleanup-tab";
import { DebugTab } from "./tabs/debug-tab";
import { ToolsTab } from "./tabs/tools-tab";

interface DevPanelDrawerProps {
  open: boolean;
  onClose: () => void;
  schoolId: string;
}

const drawerVariants = {
  hidden: {
    x: -480,
    opacity: 0.8,
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1.0] },
  },
  exit: {
    x: -480,
    opacity: 0.8,
    transition: { duration: 0.3, ease: [0.4, 0.0, 0.2, 1.0] },
  },
} as const;

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
} as const;

export function DevPanelDrawer({ open, onClose, schoolId }: DevPanelDrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            key="dev-panel-overlay"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            key="dev-panel-drawer"
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed left-0 top-0 z-[61] flex h-screen w-[480px] max-w-[90vw] flex-col border-r border-sidebar-border bg-sidebar metallic-surface"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Code2 className="h-5 w-5 neon-icon-blue" />
                <h2 className="text-lg font-bold metallic-heading">
                  Developer Panel
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="generate" className="flex-1 min-h-0 flex flex-col">
              <div className="border-b px-2 pt-1">
                <TabsList variant="line" className="w-full">
                  <TabsTrigger value="generate" className="gap-1 text-xs">
                    <Database className="h-3.5 w-3.5" />
                    Generate
                  </TabsTrigger>
                  <TabsTrigger value="quick-add" className="gap-1 text-xs">
                    <PlusCircle className="h-3.5 w-3.5" />
                    Quick Add
                  </TabsTrigger>
                  <TabsTrigger value="cleanup" className="gap-1 text-xs">
                    <Trash2 className="h-3.5 w-3.5" />
                    Cleanup
                  </TabsTrigger>
                  <TabsTrigger value="debug" className="gap-1 text-xs">
                    <Bug className="h-3.5 w-3.5" />
                    Debug
                  </TabsTrigger>
                  <TabsTrigger value="tools" className="gap-1 text-xs">
                    <Wrench className="h-3.5 w-3.5" />
                    Tools
                  </TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4">
                  <TabsContent value="generate">
                    <GenerateTab schoolId={schoolId} />
                  </TabsContent>
                  <TabsContent value="quick-add">
                    <QuickAddTab schoolId={schoolId} />
                  </TabsContent>
                  <TabsContent value="cleanup">
                    <CleanupTab schoolId={schoolId} />
                  </TabsContent>
                  <TabsContent value="debug">
                    <DebugTab schoolId={schoolId} />
                  </TabsContent>
                  <TabsContent value="tools">
                    <ToolsTab schoolId={schoolId} />
                  </TabsContent>
                </div>
              </ScrollArea>
            </Tabs>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
