"use client";

import { useEffect, useState } from "react";
import { CenterCard } from "@/components/center-card";
import { CenterFormModal } from "@/components/center-form-modal";
import { getCenters, deleteCenter } from "@/lib/api/centers";
import type { Center } from "@/lib/api/centers";
import { useUser } from "@/lib/user-context";
import { isSuperAdmin, canAccessCenter } from "@/lib/utils/role";
import { toUserFriendlyMessage } from "@/lib/utils/api-error";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function SalonlarPage() {
  const { user } = useUser();
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [centerFormModalOpen, setCenterFormModalOpen] = useState(false);
  const [editCenter, setEditCenter] = useState<Center | null>(null);
  const [centerToDelete, setCenterToDelete] = useState<Center | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const centersData = await getCenters();
      setCenters(centersData);
    } catch (e) {
      toast.error(toUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCenterCreated = async (_center: Center) => {
    setCenterFormModalOpen(false);
    await loadData();
  };

  const handleCenterUpdated = async (_center: Center) => {
    setEditCenter(null);
    setCenterFormModalOpen(false);
    await loadData();
  };

  const handleDeleteConfirm = async () => {
    if (!centerToDelete) return;
    setDeleting(true);
    try {
      await deleteCenter(centerToDelete.id);
      toast.success("Merkez silindi.");
      setCenterToDelete(null);
      await loadData();
    } catch (e) {
      toast.error(toUserFriendlyMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between w-full">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Salonlar</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Merkezlere göre salonlar. Yeni Ekle ile mevcut merkeze salon ekleyebilir veya yeni merkez oluşturup salon ekleyebilirsiniz.
          </p>
        </div>
        {isSuperAdmin(user?.role) && (
          <Button onClick={() => { setEditCenter(null); setCenterFormModalOpen(true); }} className="gap-2" type="button">
            <Plus className="h-4 w-4" />
            Yeni Ekle
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div>
          {centers.length > 0 ? (
            <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {centers.map((center) => (
                <CenterCard
                  key={center.id}
                  center={center}
                  onEdit={isSuperAdmin(user?.role) ? (c) => { setEditCenter(c); setCenterFormModalOpen(true); } : undefined}
                  onDelete={isSuperAdmin(user?.role) ? (c) => setCenterToDelete(c) : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed rounded-lg">
              <p className="text-muted-foreground mb-4">
                Henüz merkez yok. Yeni Ekle ile merkez ve salon ekleyebilirsiniz.
              </p>
            </div>
          )}
        </div>
      )}

      <CenterFormModal
        open={centerFormModalOpen}
        onOpenChange={(open) => {
          setCenterFormModalOpen(open);
          if (!open) setEditCenter(null);
        }}
        mode={editCenter ? "update" : "create"}
        initialCenter={editCenter ?? undefined}
        onSuccess={editCenter ? handleCenterUpdated : handleCenterCreated}
      />

      <Dialog open={!!centerToDelete} onOpenChange={(open) => { if (!open) setCenterToDelete(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader className="px-1 sm:px-0">
            <DialogTitle className="text-base sm:text-lg">Merkezi sil</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              &quot;{centerToDelete?.name}&quot; merkezini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 px-1 sm:px-0 pt-2 sm:pt-0">
            <Button variant="outline" className="w-full sm:w-auto h-9 sm:h-10 text-sm" onClick={() => setCenterToDelete(null)}>
              İptal
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto h-9 sm:h-10 text-sm" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? "Siliniyor..." : "Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
