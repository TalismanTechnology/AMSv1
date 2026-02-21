"use client";

import { Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

interface NewChatFabProps {
  visible: boolean;
  onClick: () => void;
}

export function NewChatFab({ visible, onClick }: NewChatFabProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-24 right-6 z-50"
        >
          <Button
            onClick={onClick}
            size="lg"
            className="h-12 w-12 rounded-full shadow-lg"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
