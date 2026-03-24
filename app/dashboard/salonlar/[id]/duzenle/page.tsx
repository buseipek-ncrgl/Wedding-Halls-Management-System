"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateCenter, getCenterById, type UpdateCenterData } from "@/lib/api/centers";
import { toUserFriendlyMessage } from "@/lib/utils/api-error";
import { toast } from "sonner";
import { Building2, ArrowLeft } from "lucide-react";
import { centerDetailPath } from "@/lib/dashboard-routes";

export default function EditCenterPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const centerId = searchParams.get("id") || (params.id as string);
  
  const [form, setForm] = useState<UpdateCenterData & { capacity: number }>({
    name: "",
    address: "",
    description: "",
    imageUrl: "",
    capacity: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (centerId) {
      loadCenter();
    }
  }, [centerId]);

  const loadCenter = async () => {
    setLoading(true);
    try {
      const center = await getCenterById(centerId);
      if (!center) {
        toast.error("Merkez bulunamadı.");
        router.push("/dashboard/salonlar");
        return;
      }

      // Kapasite bilgisini description'dan çıkar
      let capacity = 0;
      let description = center.description || "";
      const capacityMatch = description.match(/Toplam Kapasite:\s*(\d+)/);
      if (capacityMatch) {
        capacity = parseInt(capacityMatch[1], 10);
        description = description.replace(/\n\nToplam Kapasite:\s*\d+.*/, "").trim();
      }

      setForm({
        name: center.name || "",
        address: center.address || "",
        description,
        imageUrl: center.imageUrl || "",
        capacity,
      });
    } catch (e) {
      toast.error(toUserFriendlyMessage(e));
      router.push("/dashboard/salonlar");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Merkez adı girin.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Kapasite bilgisini description'a ekle
      const centerData: UpdateCenterData = {
        name: form.name.trim(),
        address: form.address.trim(),
        description: form.capacity > 0 
          ? `${form.description.trim()}\n\nToplam Kapasite: ${form.capacity} kişi`.trim()
          : form.description.trim(),
        imageUrl: form.imageUrl.trim(),
      };

      await updateCenter(centerId, centerData);
      toast.success("Merkez güncellendi.");
      router.push(centerDetailPath(centerId));
    } catch (e) {
      toast.error(toUserFriendlyMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(centerDetailPath(centerId))}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Merkezi Düzenle
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Merkez bilgilerini güncelleyin.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="center-name">Merkez Adı *</Label>
          <Input
            id="center-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Örn: Şehitkamil Kültür Kongre Merkezi"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="center-address">Adres</Label>
          <Input
            id="center-address"
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            placeholder="Adres"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="center-capacity">Toplam Kapasite</Label>
          <Input
            id="center-capacity"
            type="number"
            min={0}
            value={form.capacity || ""}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                capacity: parseInt(e.target.value, 10) || 0,
              }))
            }
            placeholder="Kişi sayısı"
          />
          <p className="text-xs text-muted-foreground">
            Merkezin toplam kapasitesi (isteğe bağlı)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="center-imageUrl">Görsel URL</Label>
          <Input
            id="center-imageUrl"
            value={form.imageUrl}
            onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
            placeholder="https://..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="center-description">Açıklama</Label>
          <Textarea
            id="center-description"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Kısa açıklama"
            className="min-h-24 resize-none"
          />
        </div>

        <div className="flex gap-4 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(centerDetailPath(centerId))}
            className="flex-1"
          >
            İptal
          </Button>
          <Button
            type="submit"
            disabled={!form.name.trim() || isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </form>
    </div>
  );
}
