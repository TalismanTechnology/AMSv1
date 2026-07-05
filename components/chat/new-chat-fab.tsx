"use client";

import { Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MagneticButton } from "@/components/motion/magnetic-button";

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
          <MagneticButton strength={0.2} radius={60}>
            <Button
              onClick={onClick}
              size="lg"
              className="relative h-12 w-12 rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 elev-1"
            >
              <Plus className="size-5" />
            </Button>
          </MagneticButton>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
