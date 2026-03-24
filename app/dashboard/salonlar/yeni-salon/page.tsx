"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { createHall, type CreateHallData } from "@/lib/api/halls";
import { getCenters, type Center } from "@/lib/api/centers";
import { getAllUsers } from "@/lib/api/auth";
import type { User } from "@/lib/types";
import { toUserFriendlyMessage } from "@/lib/utils/api-error";
import { centerDetailPath } from "@/lib/dashboard-routes";
import { toast } from "sonner";
import { Building2, ArrowLeft, Upload, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TECHNICAL_DETAILS_OPTIONS = [
  { id: "ses-sistemi", label: "Ses Sistemi" },
  { id: "isiklandirma", label: "Işıklandırma" },
  { id: "projeksiyon", label: "Projeksiyon/Perde" },
  { id: "mikrofon", label: "Mikrofon" },
  { id: "muzik-sistemi", label: "Müzik Sistemi" },
  { id: "wifi", label: "WiFi İnternet" },
  { id: "klima", label: "Klima" },
  { id: "park-yeri", label: "Park Yeri" },
  { id: "asansor", label: "Asansör" },
  { id: "engelli-erisim", label: "Engelli Erişimi" },
  { id: "mutfak", label: "Mutfak" },
  { id: "bufe-alani", label: "Büfe Alanı" },
  { id: "dans-pisti", label: "Dans Pisti" },
  { id: "dekorasyon", label: "Dekorasyon Hizmeti" },
  { id: "güvenlik", label: "Güvenlik" },
  { id: "temizlik", label: "Temizlik Hizmeti" },
  { id: "ses-yalitimi", label: "Ses Yalıtımı" },
  { id: "hazirlik-odasi", label: "Hazırlık Odası" },
  { id: "vestiyer", label: "Vestiyer" },
  { id: "tuvalet", label: "Tuvalet" },
];

function parseTechnicalDetails(details: string): Set<string> {
  if (!details) return new Set();
  const foundIds = new Set<string>();
  const items = details.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  items.forEach((item) => {
    const option = TECHNICAL_DETAILS_OPTIONS.find(
      (opt) => opt.label.toLowerCase() === item.toLowerCase() || opt.id === item
    );
    if (option) foundIds.add(option.id);
  });
  return foundIds;
}

function formatTechnicalDetails(selected: Set<string>): string {
  const labels = Array.from(selected)
    .map((id) => {
      const option = TECHNICAL_DETAILS_OPTIONS.find((opt) => opt.id === id);
      return option ? option.label : id;
    })
    .filter(Boolean);
  return labels.join(", ");
}

export default function NewHallPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const centerIdParam = searchParams.get("centerId");

  const [form, setForm] = useState<Omit<CreateHallData, "centerId"> & { centerId: string; floorNumber: string }>({
    centerId: centerIdParam || "",
    name: "",
    address: "",
    capacity: 0,
    description: "",
    imageUrl: "",
    technicalDetails: "",
    allowedUserIds: [],
    floorNumber: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const [selectedTechnicalDetails, setSelectedTechnicalDetails] = useState<Set<string>>(new Set());
  const [selectedEditorIds, setSelectedEditorIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [centers, setCenters] = useState<Center[]>([]);
  const [editors, setEditors] = useState<User[]>([]);

  useEffect(() => {
    getCenters()
      .then(setCenters)
      .catch(() => setCenters([]));
    getAllUsers()
      .then((users) => users.filter((u) => u.role === "Editor"))
      .then(setEditors)
      .catch(() => setEditors([]));
  }, []);

  useEffect(() => {
    if (centerIdParam && centers.length > 0) {
      setForm((p) => ({ ...p, centerId: centerIdParam }));
    }
  }, [centerIdParam, centers]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Lütfen bir görsel dosyası seçin.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Görsel boyutu 5MB'dan küçük olmalıdır.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 400;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          const scale = Math.min(MAX_SIZE / width, MAX_SIZE / height);
          width = Math.floor(width * scale);
          height = Math.floor(height * scale);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          let quality = 0.3;
          let base64String = canvas.toDataURL("image/jpeg", quality);
          let attempts = 0;
          while (base64String.length > 1000 && attempts < 5) {
            const scale = Math.sqrt(900 / base64String.length);
            width = Math.max(50, Math.floor(width * scale));
            height = Math.max(50, Math.floor(height * scale));
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            base64String = canvas.toDataURL("image/jpeg", quality);
            attempts++;
          }
          if (base64String.length > 1000) {
            toast.error("Görsel çok büyük. Lütfen görsel URL'i kullanın veya daha küçük bir görsel seçin.");
            setForm((p) => ({ ...p, imageUrl: "" }));
            setImagePreview("");
            return;
          }
          setForm((p) => ({ ...p, imageUrl: base64String }));
          setImagePreview(base64String);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleTechnicalDetailToggle = (detailId: string) => {
    const newSelected = new Set(selectedTechnicalDetails);
    if (newSelected.has(detailId)) newSelected.delete(detailId);
    else newSelected.add(detailId);
    setSelectedTechnicalDetails(newSelected);
    setForm((p) => ({ ...p, technicalDetails: formatTechnicalDetails(newSelected) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Salon adı girin.");
      return;
    }
    if (form.capacity < 1) {
      toast.error("Kapasite 1 veya daha büyük olmalıdır.");
      return;
    }
    if (!form.centerId) {
      toast.error("Lütfen bir merkez seçin.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Kat numarasını address'e ekle
      const addressWithFloor = form.floorNumber.trim()
        ? `${form.address.trim()}${form.address.trim() ? ", " : ""}Kat: ${form.floorNumber.trim()}`
        : form.address.trim();

      const hallData: CreateHallData = {
        centerId: form.centerId,
        name: form.name.trim(),
        address: addressWithFloor,
        capacity: form.capacity,
        description: form.description.trim(),
        imageUrl: form.imageUrl.trim() || "",
        technicalDetails: formatTechnicalDetails(selectedTechnicalDetails),
        allowedUserIds: Array.from(selectedEditorIds),
      };

      await createHall(hallData);
      toast.success("Salon oluşturuldu.");
      router.push(centerDetailPath(form.centerId));
    } catch (e) {
      toast.error(toUserFriendlyMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 w-full max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/dashboard/salonlar")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Yeni Salon Ekle
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Yeni salon bilgilerini girin.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="hall-center">Merkez *</Label>
          <Select
            value={form.centerId}
            onValueChange={(value) => setForm((p) => ({ ...p, centerId: value }))}
          >
            <SelectTrigger id="hall-center">
              <SelectValue placeholder="Merkez seçin" />
            </SelectTrigger>
            <SelectContent>
              {centers.map((center) => (
                <SelectItem key={center.id} value={center.id}>
                  {center.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hall-name">Salon Adı *</Label>
          <Input
            id="hall-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Salon adı"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hall-floor">Kat Numarası</Label>
          <Input
            id="hall-floor"
            value={form.floorNumber}
            onChange={(e) => setForm((p) => ({ ...p, floorNumber: e.target.value }))}
            placeholder="Örn: 1, 2, Zemin, Bodrum"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hall-capacity">Kapasite *</Label>
          <Input
            id="hall-capacity"
            type="number"
            min={1}
            value={form.capacity || ""}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                capacity: parseInt(e.target.value, 10) || 0,
              }))
            }
            placeholder="Kişi sayısı"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hall-address">Adres</Label>
          <Input
            id="hall-address"
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            placeholder="Adres"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hall-description">Açıklama</Label>
          <Textarea
            id="hall-description"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Açıklama"
            className="min-h-24 resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label>Salon Görseli</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Görsel Seç
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            {imagePreview && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setImagePreview("");
                  setForm((p) => ({ ...p, imageUrl: "" }));
                }}
                className="gap-2 text-destructive"
              >
                <X className="h-4 w-4" />
                Kaldır
              </Button>
            )}
          </div>
          {imagePreview ? (
            <div className="relative w-full overflow-hidden rounded-lg border border-border mt-2">
              <img src={imagePreview} alt="Preview" className="h-48 w-full object-cover" />
            </div>
          ) : (
            <Input
              value={form.imageUrl}
              onChange={(e) => {
                setForm((p) => ({ ...p, imageUrl: e.target.value }));
                setImagePreview(e.target.value);
              }}
              placeholder="Veya görsel URL'i girin..."
              className="mt-2"
            />
          )}
        </div>

        <div className="space-y-2">
          <Label>Özellikler (Teknik Detaylar)</Label>
          <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 max-h-60 overflow-y-auto">
            {TECHNICAL_DETAILS_OPTIONS.map((option) => (
              <div key={option.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`tech-${option.id}`}
                  checked={selectedTechnicalDetails.has(option.id)}
                  onCheckedChange={() => handleTechnicalDetailToggle(option.id)}
                />
                <label
                  htmlFor={`tech-${option.id}`}
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  {option.label}
                </label>
              </div>
            ))}
          </div>
          <Textarea
            value={form.technicalDetails}
            onChange={(e) => {
              setForm((p) => ({ ...p, technicalDetails: e.target.value }));
              setSelectedTechnicalDetails(parseTechnicalDetails(e.target.value));
            }}
            placeholder="Ek teknik detaylar (isteğe bağlı)"
            className="min-h-20 resize-none mt-2"
          />
        </div>

        <div className="space-y-2">
          <Label>Erişim İzni Olan Editörler</Label>
          <div className="space-y-2 rounded-lg border p-3 max-h-48 overflow-y-auto">
            {editors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz editör kullanıcı yok.</p>
            ) : (
              editors.map((editor) => (
                <div key={editor.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`editor-${editor.id}`}
                    checked={selectedEditorIds.has(editor.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedEditorIds);
                      if (checked) next.add(editor.id);
                      else next.delete(editor.id);
                      setSelectedEditorIds(next);
                    }}
                  />
                  <label
                    htmlFor={`editor-${editor.id}`}
                    className="text-sm font-medium leading-none cursor-pointer flex-1"
                  >
                    {editor.name} ({editor.email})
                  </label>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex gap-4 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/salonlar")}
            className="flex-1"
          >
            İptal
          </Button>
          <Button
            type="submit"
            disabled={!form.name.trim() || form.capacity < 1 || !form.centerId || isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? "Kaydediliyor..." : "Oluştur"}
          </Button>
        </div>
      </form>
    </div>
  );
}
