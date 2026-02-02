"use client";

import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Users, Edit, Trash2, MessageSquarePlus } from "lucide-react";
import type { WeddingHall } from "@/lib/types";
import { useUser } from "@/lib/user-context";
import { isViewer } from "@/lib/utils/role";

interface HallCardProps {
  hall: WeddingHall;
  /** SuperAdmin: salon düzenleme */
  onEdit?: (hall: WeddingHall) => void;
  /** SuperAdmin: salon silme */
  onDelete?: (hall: WeddingHall) => void;
}

export function HallCard({ hall, onEdit, onDelete }: HallCardProps) {
  const { user } = useUser();
  const canRequest = isViewer(user?.role);

  return (
    <Card className="group overflow-hidden border border-border bg-card transition-all duration-200 hover:shadow-lg">
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={hall.imageUrl || "/placeholder.svg"}
          alt={hall.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      
      <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-4 md:p-5">
        <h3 className="text-base sm:text-lg font-semibold text-foreground line-clamp-1" title={hall.name}>
          {hall.name}
        </h3>
        
        <div className="flex items-start gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
          <span className="line-clamp-2 break-words">{hall.address}</span>
        </div>
        
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
          <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
          <span>{hall.capacity} Kişilik Kapasite</span>
        </div>
      </CardContent>
      
      <CardFooter className="flex flex-col gap-2 border-t border-border bg-muted/30 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row gap-2 w-full">
          <Link href={`/dashboard/${hall.id}`} className="flex-1 w-full sm:w-auto" prefetch={false}>
            <Button
              variant="default"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-8 sm:h-9 md:h-10 text-xs sm:text-sm"
            >
              Detayları Gör
            </Button>
          </Link>
          <div className="flex gap-2 shrink-0">
            {onEdit && (
              <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10" onClick={() => onEdit(hall)} title="Düzenle">
                <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            )}
            {onDelete && (
              <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 text-destructive hover:text-destructive" onClick={() => onDelete(hall)} title="Sil">
                <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            )}
          </div>
        </div>
        {/* Talep Et butonu yorum satırına alındı - Geri aktif etmek için yorum satırlarını kaldırın */}
        {/* {canRequest && (
          <Link href={`/dashboard/talep-et?hallId=${hall.id}`} className="w-full" prefetch={false}>
            <Button variant="outline" className="w-full gap-1.5 sm:gap-2 h-8 sm:h-9 md:h-10 text-xs sm:text-sm">
              <MessageSquarePlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Talep Oluştur
            </Button>
          </Link>
        )} */}
      </CardFooter>
    </Card>
  );
}
