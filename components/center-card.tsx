"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Building2, Eye, Edit, Trash2 } from "lucide-react";
import type { Center } from "@/lib/api/centers";
import { centerDetailPath } from "@/lib/dashboard-routes";

interface CenterCardProps {
  center: Center;
  /** SuperAdmin: merkez düzenleme */
  onEdit?: (center: Center) => void;
  /** SuperAdmin: merkez silme */
  onDelete?: (center: Center) => void;
}

export function CenterCard({ center, onEdit, onDelete }: CenterCardProps) {
  return (
    <Card className="group overflow-hidden border border-border bg-card transition-all duration-200 hover:shadow-lg">
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={center.imageUrl || "/placeholder.svg"}
          alt={center.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      
      <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-4 md:p-5">
        <h3 className="text-base sm:text-lg font-semibold text-foreground line-clamp-1 flex items-center gap-1.5 sm:gap-2">
          <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
          <span className="truncate" title={center.name}>{center.name}</span>
        </h3>
        
        {center.address && (
          <div className="flex items-start gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="line-clamp-2 break-words">{center.address}</span>
          </div>
        )}
        
        {center.description && (
          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 break-words">
            {center.description}
          </p>
        )}
      </CardContent>
      
      <CardFooter className="flex flex-col gap-2 border-t border-border bg-muted/30 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row gap-2 w-full">
          <Link href={centerDetailPath(center.id)} className="flex-1 w-full sm:w-auto" prefetch={false}>
            <Button
              variant="default"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 sm:gap-2 h-8 sm:h-9 md:h-10 text-xs sm:text-sm"
            >
              <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Detay ve Salonları Gör</span>
              <span className="sm:hidden">Detay</span>
            </Button>
          </Link>
          <div className="flex gap-2 shrink-0">
            {onEdit && (
              <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10" onClick={() => onEdit(center)} title="Düzenle">
                <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 text-destructive hover:text-destructive"
                onClick={() => onDelete(center)}
                title="Sil"
              >
                <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
