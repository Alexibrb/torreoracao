'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { format, addDays, isWithinInterval, startOfDay, endOfDay, setHours, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, HelpingHand, User, Lock, Trash2, Loader2, Edit, XCircle, Save, AlertTriangle, KeyRound, List, Pencil, Eye, UserCheck, UserX } from 'lucide-react';
import React, { useState, useMemo, useEffect, useCallback, SVGProps } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { doc, onSnapshot, setDoc, deleteDoc, getDoc, writeBatch, collection, query, where, getDocs, orderBy } from "firebase/firestore";
import type { DateRange } from "react-day-picker";


import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { db, firebaseApp } from '@/lib/firebase';

const FIRESTORE_COLLECTION = "torredeoracao";
const WHATSAPP_CONFIG_DOC = "whatsappConfig";
const ADMIN_CONFIG_DOC = "adminConfig";

function WhatsappIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      <path d="M14.05 14.05a7 7 0 1 0-9.9-9.9" />
    </svg>
  );
}

type Slot = {
  time: string;
  isBooked: boolean;
  bookedBy: string | null;
  dateTime: string;
  password?: string | null;
};

type ScheduleData = {
  id: string;
  slots: Slot[];
  startDate: string;
  endDate: string;
  startTime: number;
  endTime: number;
  whatsAppSent?: boolean;
};


const bookingFormSchema = z.object({
  name: z.string().min(2, { message: 'O nome deve ter pelo menos 2 caracteres.' }).max(50),
  password: z.string().min(4, { message: 'A senha deve ter pelo menos 4 caracteres.'}),
});

const deleteBookingFormSchema = z.object({
  password: z.string().min(1, { message: 'Por favor, insira a senha.' }),
});

const editBookingFormSchema = z.object({
  name: z.string().min(2, { message: 'O nome deve ter pelo menos 2 caracteres.' }).max(50),
});

const adminAuthSchema = z.object({
  password: z.string().min(1, { message: 'A senha é obrigatória.' }),
});

export function PrayerSchedule() {
  const [scheduleStartDate, setScheduleStartDate] = useState<Date | undefined>();
  const [scheduleEndDate, setScheduleEndDate] = useState<Date | undefined>();
  const [allSchedules, setAllSchedules] = useState<ScheduleData[]>([]);
  const [activeSchedule, setActiveSchedule] = useState<ScheduleData | null>(null);
  
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false);
  const [isDeletingDialogOpen, setIsDeletingDialogOpen] = useState(false);
  const [isScheduleDeleteDialogOpen, setIsScheduleDeleteDialogOpen] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  
  const [startTime, setStartTime] = useState(6);
  const [endTime, setEndTime] = useState(18);
  const [whatsAppNumber, setWhatsAppNumber] = useState('');
  const [whatsAppNumberInput, setWhatsAppNumberInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [isEditingDialogOpen, setIsEditingDialogOpen] = useState(false);
  const [firebaseError, setFirebaseError] = useState(false);
  const [adminPassword, setAdminPassword] = useState('123');
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>();
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>();
  const [showAdminBookings, setShowAdminBookings] = useState(false);
  const [userCanDeleteBookings, setUserCanDeleteBookings] = useState(true);


  const { toast } = useToast();
  
  const bookingForm = useForm<z.infer<typeof bookingFormSchema>>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: { name: '', password: '' },
  });

  const deleteBookingForm = useForm<z.infer<typeof deleteBookingFormSchema>>({
    resolver: zodResolver(deleteBookingFormSchema),
    defaultValues: { password: '' },
  });

  const editBookingForm = useForm<z.infer<typeof editBookingFormSchema>>({
    resolver: zodResolver(editBookingFormSchema),
    defaultValues: { name: '' },
  });

  const authForm = useForm<z.infer<typeof adminAuthSchema>>({
    resolver: zodResolver(adminAuthSchema),
    defaultValues: { password: '' },
  });

  useEffect(() => {
    setIsLoading(true);
    setFirebaseError(false);
    
    const q = query(collection(db, FIRESTORE_COLLECTION), orderBy("startDate", "asc"));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const today = startOfDay(new Date());
        let currentAndFutureSchedules: ScheduleData[] = [];
        
        querySnapshot.forEach((doc) => {
            if (doc.id === ADMIN_CONFIG_DOC || doc.id === WHATSAPP_CONFIG_DOC) return;

            const data = doc.data() as Omit<ScheduleData, 'id'>;
            const schedule = { id: doc.id, ...data };
            const scheduleEnd = endOfDay(new Date(schedule.endDate));

            if (today <= scheduleEnd) {
                currentAndFutureSchedules.push(schedule);
            }
        });
        
        setAllSchedules(currentAndFutureSchedules);
        
        const currentActiveId = activeSchedule?.id;
        const activeStillExists = currentAndFutureSchedules.some(s => s.id === currentActiveId);

        if (activeStillExists && activeSchedule) {
            const updatedActive = currentAndFutureSchedules.find(s => s.id === activeSchedule.id);
            setActiveSchedule(updatedActive || null);
        } else if (currentAndFutureSchedules.length > 0) {
            let foundSchedule: ScheduleData | null = null;
            let futureSchedule: ScheduleData | null = null;

            for(const schedule of currentAndFutureSchedules) {
                const scheduleStart = startOfDay(new Date(schedule.startDate));
                const scheduleEnd = endOfDay(new Date(schedule.endDate));

                if (isWithinInterval(today, { start: scheduleStart, end: scheduleEnd })) {
                    foundSchedule = schedule;
                    break;
                }
                if (scheduleStart > today && !futureSchedule) {
                    futureSchedule = schedule;
                }
            }
            
            const scheduleToSet = foundSchedule || futureSchedule || currentAndFutureSchedules[0];

            if(!activeSchedule || activeSchedule.id !== scheduleToSet.id) {
              setActiveSchedule(scheduleToSet);
              setFilterStartDate(new Date(scheduleToSet.startDate));
              setFilterEndDate(new Date(scheduleToSet.endDate));
            }
        } else {
            setActiveSchedule(null);
        }

        setIsLoading(false);

    }, (error) => {
        console.error("Firestore snapshot error:", error);
        toast({
            title: "Erro de Sincronização",
            description: "Não foi possível conectar ao banco de dados. Verifique sua conexão e as permissões do Firebase.",
            variant: "destructive"
        });
        setFirebaseError(true);
        setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);


  useEffect(() => {
    // Fetch WhatsApp config
    const whatsAppDocRef = doc(db, FIRESTORE_COLLECTION, WHATSAPP_CONFIG_DOC);
    getDoc(whatsAppDocRef).then((docSnap) => {
        if(docSnap.exists() && docSnap.data().number) {
            const number = docSnap.data().number;
            setWhatsAppNumber(number);
            setWhatsAppNumberInput(number);
        }
    }).catch(err => console.error("Error fetching whatsapp config", err));

    // Fetch Admin config
    const adminDocRef = doc(db, FIRESTORE_COLLECTION, ADMIN_CONFIG_DOC);
    getDoc(adminDocRef).then((docSnap) => {
        if(docSnap.exists()) {
            const data = docSnap.data();
            if (data.password) {
                setAdminPassword(data.password);
            }
            if (typeof data.userCanDeleteBookings === 'boolean') {
                setUserCanDeleteBookings(data.userCanDeleteBookings);
            }
        }
    }).catch(err => console.error("Error fetching admin password", err));
  }, []);

  const updateScheduleInFirestore = useCallback(async (schedule: ScheduleData) => {
      const docRef = doc(db, FIRESTORE_COLLECTION, schedule.id);
      try {
        await setDoc(docRef, schedule, { merge: true });
      } catch (error) {
          console.error("Failed to save state to Firestore", error);
          toast({
              title: "Erro de Salvamento",
              description: "Não foi possível salvar as alterações no banco de dados.",
              variant: "destructive",
          });
      }
  }, [toast]);

  const updateAdminConfigInFirestore = async (key: string, value: any) => {
    try {
      const adminDocRef = doc(db, FIRESTORE_COLLECTION, ADMIN_CONFIG_DOC);
      await setDoc(adminDocRef, { [key]: value }, { merge: true });
      return true;
    } catch (error) {
      console.error(`Failed to save ${key} to Firestore`, error);
      toast({
        title: "Erro de Salvamento",
        description: "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleUpdateWhatsAppConfig = async (newNumber: string) => {
    if (newNumber.length < 4) {
      toast({
        title: "Número Inválido",
        description: "O número do WhatsApp precisa ter pelo menos 4 dígitos.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const batch = writeBatch(db);
      
      const whatsAppDocRef = doc(db, FIRESTORE_COLLECTION, WHATSAPP_CONFIG_DOC);
      batch.set(whatsAppDocRef, { number: newNumber });
      
      const newPassword = `ibrb${newNumber.slice(-4)}`;
      const adminDocRef = doc(db, FIRESTORE_COLLECTION, ADMIN_CONFIG_DOC);
      batch.set(adminDocRef, { password: newPassword }, { merge: true });
      
      await batch.commit();
      
      setWhatsAppNumber(newNumber);
      setAdminPassword(newPassword);
      setWhatsAppNumberInput(newNumber);

      toast({
          title: "Configuração Salva!",
          description: `O número de WhatsApp foi atualizado e uma nova senha de admin foi gerada: ${newPassword}`
      });
    } catch (error) {
        console.error("Failed to save WhatsApp config or admin password to Firestore", error);
        toast({
            title: "Erro de Salvamento",
            description: "Não foi possível salvar as configurações.",
            variant: "destructive",
        });
    }
  };
  
  const handleUserCanDeleteToggle = async (checked: boolean) => {
    const success = await updateAdminConfigInFirestore('userCanDeleteBookings', checked);
    if(success) {
      setUserCanDeleteBookings(checked);
      toast({
          title: "Permissão Atualizada!",
          description: checked ? "Usuários agora podem liberar seus horários." : "Usuários não podem mais liberar seus horários."
      });
    }
  };

  const generateTimeSlots = useCallback((
    startDate: Date,
    endDate: Date,
    startHour: number,
    endHour: number
  ): Slot[] => {
    const newSlots: Slot[] = [];

    let currentDate = startOfDay(new Date(startDate));
    const finalDate = endOfDay(new Date(endDate));

    while (currentDate.getTime() <= finalDate.getTime()) {
      let currentHour = new Date(currentDate);
      currentHour.setHours(startHour, 0, 0, 0);

      const dayEndHour = (startOfDay(currentDate).getTime() === startOfDay(finalDate).getTime()) ? endHour : 24;

      while(currentHour.getHours() < dayEndHour) {
          const nextHour = new Date(currentHour);
          nextHour.setHours(currentHour.getHours() + 1);

          if (startOfDay(currentDate).getTime() === startOfDay(finalDate).getTime() && nextHour.getHours() > endHour) {
             break;
          }

          const time = `${format(currentHour, 'dd/MM')} ${String(currentHour.getHours()).padStart(2, '0')}h-${String(nextHour.getHours()).padStart(2, '0')}h`;

          newSlots.push({
            time: time,
            isBooked: false,
            bookedBy: null,
            dateTime: currentHour.toISOString(),
            password: null,
          });
          
          currentHour.setHours(currentHour.getHours() + 1);
      }
      currentDate = addDays(currentDate, 1);
    }
    
    return newSlots;
  }, []);


  const slotsByDay = useMemo(() => {
    if (!activeSchedule) return {};
  
    const filteredSlots = activeSchedule.slots.filter(slot => {
      const slotDate = startOfDay(parseISO(slot.dateTime));
      const start = filterStartDate ? startOfDay(filterStartDate) : null;
      const end = filterEndDate ? endOfDay(filterEndDate) : null;
  
      if (start && slotDate < start) {
        return false;
      }
      if (end && slotDate > end) {
        return false;
      }
      return true;
    });
  
    const groupedSlots: { [key: string]: Slot[] } = {};
  
    filteredSlots.forEach(slot => {
      const dayKey = format(parseISO(slot.dateTime), 'PPP', { locale: ptBR });
      if (!groupedSlots[dayKey]) {
        groupedSlots[dayKey] = [];
      }
      groupedSlots[dayKey].push(slot);
    });
  
    for (const dayKey in groupedSlots) {
      groupedSlots[dayKey].sort((a, b) => a.dateTime.localeCompare(b.dateTime));
    }
  
    return groupedSlots;
  }, [activeSchedule, filterStartDate, filterEndDate]);
  

  const bookedSlots = useMemo(() => activeSchedule?.slots.filter((s) => s.isBooked).sort((a, b) => a.dateTime.localeCompare(b.dateTime)) || [], [activeSchedule]);
  const allSlotsBooked = useMemo(() => !!activeSchedule && activeSchedule.slots.length > 0 && activeSchedule.slots.every((s) => s.isBooked), [activeSchedule]);

  const handleSendToWhatsApp = useCallback(async () => {
    if (!activeSchedule || bookedSlots.length === 0) return;

    if (!whatsAppNumber) {
        toast({
            title: "Número do WhatsApp não configurado",
            description: "Por favor, configure o número do WhatsApp na área do administrador.",
            variant: "destructive"
        });
        return;
    }
    const scheduleText = `*Escala da Torre de Oração para o período de ${format(new Date(activeSchedule.startDate), 'PPP', { locale: ptBR })} a ${format(new Date(activeSchedule.endDate), 'PPP', { locale: ptBR })}*\n\n${bookedSlots
      .map((s) => `*${s.time}*: ${s.bookedBy}`)
      .join('\n')}\n\nObrigado a todos pela participação!`;
    const encodedMessage = encodeURIComponent(scheduleText);
    const whatsappUrl = `https://wa.me/${whatsAppNumber}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    
    const updatedSchedule = { ...activeSchedule, whatsAppSent: true };
    await updateScheduleInFirestore(updatedSchedule);

  }, [activeSchedule, bookedSlots, whatsAppNumber, toast, updateScheduleInFirestore]);

  useEffect(() => {
    if (allSlotsBooked && activeSchedule && !activeSchedule.whatsAppSent) {
      handleSendToWhatsApp();
    }
  }, [allSlotsBooked, activeSchedule, handleSendToWhatsApp]);

  const handleSelectSlot = (slot: Slot) => {
    setSelectedSlot(slot);
    if (slot.isBooked) {
      if (userCanDeleteBookings) {
        deleteBookingForm.reset();
        setIsDeletingDialogOpen(true);
      } else {
        toast({
          title: "Ação não permitida",
          description: "O administrador desativou a liberação de horários.",
          variant: "destructive"
        })
      }
    } else {
      bookingForm.reset();
      setIsBookingDialogOpen(true);
    }
  };
  
  const handleEditSlot = (slot: Slot) => {
    setEditingSlot(slot);
    editBookingForm.setValue("name", slot.bookedBy || "");
    setIsEditingDialogOpen(true);
  };

  const handleBookingSubmit = async (values: z.infer<typeof bookingFormSchema>) => {
    if (selectedSlot && activeSchedule) {
      const updatedSlots = activeSchedule.slots.map((s) =>
        s.dateTime === selectedSlot.dateTime ? { ...s, isBooked: true, bookedBy: values.name, password: values.password } : s
      );
      
      const updatedSchedule = { ...activeSchedule, slots: updatedSlots };
      await updateScheduleInFirestore(updatedSchedule);
      
      setIsBookingDialogOpen(false);
      setSelectedSlot(null);
      toast({
        title: 'Horário Agendado!',
        description: `Obrigado, ${values.name}. Sua hora de oração foi confirmada.`,
        className: 'bg-green-600 text-white',
      });
    }
  };
  
  const handleDeleteBookingSubmit = async (values: z.infer<typeof deleteBookingFormSchema>) => {
    if (selectedSlot && activeSchedule) {
      if (values.password === selectedSlot.password) {
        const updatedSlots = activeSchedule.slots.map((s) =>
          s.dateTime === selectedSlot.dateTime ? { ...s, isBooked: false, bookedBy: null, password: null } : s
        );
        const updatedSchedule = { ...activeSchedule, slots: updatedSlots };
        await updateScheduleInFirestore(updatedSchedule);

        setIsDeletingDialogOpen(false);
        setSelectedSlot(null);
        toast({
          title: 'Agendamento Removido!',
          description: `O horário ${selectedSlot.time} foi liberado.`,
        });
      } else {
        toast({
          title: 'Senha Incorreta',
          description: 'A senha para liberar este horário está incorreta.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleEditBookingSubmit = async (values: z.infer<typeof editBookingFormSchema>) => {
    if (editingSlot && activeSchedule) {
      const updatedSlots = activeSchedule.slots.map((s) =>
        s.dateTime === editingSlot.dateTime ? { ...s, isBooked: true, bookedBy: values.name } : s
      );
      
      const updatedSchedule = { ...activeSchedule, slots: updatedSlots };
      await updateScheduleInFirestore(updatedSchedule);

      toast({
        title: 'Agendamento Atualizado!',
        description: `O horário de ${editingSlot.time} foi atualizado para ${values.name}.`,
      });
      setIsEditingDialogOpen(false);
      setEditingSlot(null);
    }
  };
  
  const handleFreeSlot = async (slotToFree: Slot) => {
    if (activeSchedule) {
        const updatedSlots = activeSchedule.slots.map((s) =>
            s.dateTime === slotToFree.dateTime ? { ...s, isBooked: false, bookedBy: null, password: null } : s
        );
        const updatedSchedule = { ...activeSchedule, slots: updatedSlots };
        await updateScheduleInFirestore(updatedSchedule);
        toast({
            title: 'Horário Liberado!',
            description: `O horário ${slotToFree.time} está disponível novamente.`,
        });
    }
  };

  const handleAdminAuthSubmit = (values: z.infer<typeof adminAuthSchema>) => {
    if (values.password === adminPassword) {
      setIsAuthDialogOpen(false);
      setIsAdminMode(true);
      authForm.reset();
    } else {
      toast({
        title: 'Senha Incorreta',
        description: 'A senha de administrador está incorreta.',
        variant: 'destructive',
      });
      authForm.reset();
    }
  };

  const handleAdminConfigSubmit = async () => {
    if (!scheduleStartDate || !scheduleEndDate) {
        toast({ title: "Datas inválidas.", description: "Por favor, selecione as datas de início e fim.", variant: "destructive" });
        return;
    }
    
    if (scheduleStartDate > scheduleEndDate) {
      toast({ title: "Intervalo de datas inválido.", description: "A data de início deve ser anterior ou igual à data de fim.", variant: "destructive" });
      return;
    }
    
    const newSlots = generateTimeSlots(scheduleStartDate, scheduleEndDate, startTime, endTime);
    if(newSlots.length === 0){
        toast({ title: "Nenhum horário gerado.", description: "Verifique as datas e horários. A escala deve ter pelo menos uma hora.", variant: "destructive" });
        return;
    }

    const docId = format(scheduleStartDate, 'yyyy-MM-dd-HHmm');
    
    const newScheduleData: ScheduleData = {
      id: docId,
      slots: newSlots,
      startTime,
      endTime,
      startDate: scheduleStartDate.toISOString(),
      endDate: scheduleEndDate.toISOString(),
      whatsAppSent: false,
    };
    
    const docRef = doc(db, FIRESTORE_COLLECTION, docId);
    await setDoc(docRef, newScheduleData);


    toast({
      title: "Agenda Definida!",
      description: `A escala de ${format(scheduleStartDate, 'PPP', { locale: ptBR })} até ${format(scheduleEndDate, 'PPP', { locale: ptBR })} está disponível.`
    });
  };

  const handleDeleteSchedule = useCallback(async () => {
    if (activeSchedule) {
        const docRef = doc(db, FIRESTORE_COLLECTION, activeSchedule.id);
        try {
            await deleteDoc(docRef);
            setIsScheduleDeleteDialogOpen(false);
            setActiveSchedule(null); // Clear active schedule
            setShowAdminBookings(false); // Hide details
            toast({
                title: "Escala Excluída",
                description: "A escala de oração foi removida com sucesso.",
            });
        } catch (error) {
            console.error("Failed to delete schedule from Firestore", error);
            toast({
                title: "Erro ao Excluir",
                description: "Não foi possível remover a escala do banco de dados.",
                variant: "destructive",
            });
        }
    }
  }, [activeSchedule, toast]);

  const handleAdminButtonClick = () => {
    authForm.reset();
    setIsAuthDialogOpen(true);
  };
  
  const handleStartDateSelect = (date: Date | undefined) => {
    setScheduleStartDate(date);
    if (date && (!scheduleEndDate || date > scheduleEndDate)) {
      setScheduleEndDate(date);
    }
  };

  const handleFilterStartDateSelect = (date: Date | undefined) => {
    setFilterStartDate(date);
    if (date && (!filterEndDate || date > filterEndDate)) {
      setFilterEndDate(date);
    }
  };

  const handleScheduleSelect = (scheduleId: string) => {
    const selected = allSchedules.find(s => s.id === scheduleId);
    if (selected) {
        setActiveSchedule(selected);
        setFilterStartDate(new Date(selected.startDate));
        setFilterEndDate(new Date(selected.endDate));
        setShowAdminBookings(false);
    }
  };


  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <Loader2 className="w-16 h-16 animate-spin text-primary" />
        <p className="text-lg text-muted-foreground">Carregando escala de oração...</p>
      </div>
    );
  }

  // Admin View
  if (isAdminMode) {
    return (
        <div className="space-y-8">
            <Card className="shadow-lg">
                <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                    <Lock className="w-6 h-6" />
                    Área do Administrador
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setIsAdminMode(false)}>
                    Sair
                    </Button>
                </CardTitle>
                <CardDescription>
                    Configure a escala de oração, o número de WhatsApp e gerencie os agendamentos.
                </CardDescription>
                </CardHeader>
            </Card>
            
            {firebaseError && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Ação Necessária: Regras de Segurança do Firebase</AlertTitle>
                    <AlertDescription>
                        <p>O aplicativo não consegue acessar o banco de dados. Isso geralmente é causado por regras de segurança restritivas. Para corrigir, vá para o seu **Console do Firebase**:</p>
                        <ol className="list-decimal list-inside mt-2 space-y-1">
                            <li>Navegue até **Firestore Database**.</li>
                            <li>Clique na aba **Regras** (Rules).</li>
                            <li>Substitua o conteúdo existente pelas regras abaixo e clique em **Publicar**.</li>
                        </ol>
                        <pre className="mt-2 p-2 bg-gray-700 text-white rounded-md text-xs overflow-x-auto">
                            {`rules_version = '2';
service cloud.firestore {
    match /databases/{database}/documents {
        match /${FIRESTORE_COLLECTION}/{document=**} {
            allow read, write: if true;
        }
    }
}`}
                        </pre>
                    </AlertDescription>
                </Alert>
            )}

            <Card className="shadow-lg">
                <CardHeader>
                <CardTitle>Configurações Gerais</CardTitle>
                <CardDescription>
                    Gerencie as configurações globais do aplicativo.
                </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label className="font-semibold">WhatsApp e Senha Admin</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                        Insira o número de WhatsApp para onde a escala será enviada. Use o formato internacional sem `+' ou espaços (ex: 5511999998888). Ao salvar, a senha do admin será trocada para 'ibrb' + os 4 últimos dígitos do número.
                    </p>
                    <div className="flex items-center gap-2">
                        <WhatsappIcon className="w-5 h-5" />
                        <Input
                        id="whatsapp-number"
                        type="tel"
                        placeholder="Ex: 5511999998888"
                        value={whatsAppNumberInput}
                        onChange={(e) => setWhatsAppNumberInput(e.target.value)}
                        />
                        <Button size="icon" onClick={() => handleUpdateWhatsAppConfig(whatsAppNumberInput)}>
                        <Save className="w-5 h-5" />
                        </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="font-semibold">Permissão de Liberação de Horário</Label>
                     <p className="text-sm text-muted-foreground mb-2">
                        Controle se os usuários podem liberar seus próprios horários agendados usando a senha que cadastraram.
                    </p>
                     <div className="flex items-center space-x-2 rounded-lg border p-4">
                        <Switch
                          id="user-delete-permission"
                          checked={userCanDeleteBookings}
                          onCheckedChange={handleUserCanDeleteToggle}
                        />
                        <Label htmlFor="user-delete-permission" className="flex flex-col gap-1">
                          <span className='font-bold'>{userCanDeleteBookings ? "Permitido" : "Bloqueado"}</span>
                          <span className='text-xs text-muted-foreground'>
                            {userCanDeleteBookings ? "Usuários podem liberar seus horários." : "Apenas o admin pode liberar horários."}
                          </span>
                        </Label>
                     </div>
                  </div>
                </CardContent>
            </Card>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Gerenciar Escalas</CardTitle>
                    <CardDescription>
                        Selecione uma escala abaixo para ver as opções de gerenciamento.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {allSchedules.length > 0 ? (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="font-semibold">Selecione uma escala para gerenciar:</Label>
                                <Select onValueChange={handleScheduleSelect} value={activeSchedule?.id || ''}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione uma escala" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {allSchedules.map(schedule => (
                                            <SelectItem key={schedule.id} value={schedule.id}>
                                                Escala de {format(new Date(schedule.startDate), 'PPP', { locale: ptBR })} à {format(new Date(schedule.endDate), 'PPP', { locale: ptBR })}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {activeSchedule && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
                                     <Button variant="outline" onClick={() => setShowAdminBookings(prev => !prev)}>
                                        <Pencil className="w-4 h-4 mr-2" />
                                        {showAdminBookings ? "Ocultar Agendamentos" : "Ver e Editar Agendamentos"}
                                    </Button>
                                    <Button variant="secondary" onClick={() => setIsAdminMode(false)}>
                                      <Eye className="w-4 h-4 mr-2" />
                                      Ir para a Escala
                                    </Button>
                                    <AlertDialog open={isScheduleDeleteDialogOpen} onOpenChange={setIsScheduleDeleteDialogOpen}>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive">
                                                <Trash2 className="w-4 h-4 mr-2" />
                                                Excluir Escala Inteira
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Esta ação não pode ser desfeita. Isso irá apagar permanentemente a escala de {format(new Date(activeSchedule.startDate), 'PPP', { locale: ptBR })} a {format(new Date(activeSchedule.endDate), 'PPP', { locale: ptBR })} e todos os agendamentos feitos.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleDeleteSchedule}>Sim, Excluir</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">Nenhuma escala para gerenciar.</p>
                    )}
                </CardContent>
            </Card>

            <Card className="shadow-lg">
                <CardHeader>
                <CardTitle>Criar Nova Escala de Oração</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label>1. Escolha o Período da Oração</Label>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <Label>Data de Início</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                   <Button
                                        id="start-date"
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal", !scheduleStartDate && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {scheduleStartDate ? format(scheduleStartDate, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={scheduleStartDate}
                                    onSelect={handleStartDateSelect}
                                    initialFocus
                                    locale={ptBR}
                                />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label>Data de Fim</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                   <Button
                                        id="end-date"
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal", !scheduleEndDate && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {scheduleEndDate ? format(scheduleEndDate, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={scheduleEndDate}
                                    onSelect={setScheduleEndDate}
                                    initialFocus
                                    locale={ptBR}
                                    disabled={{ before: scheduleStartDate }}
                                />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>2. Defina o Intervalo de Horários</Label>
                    <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Label htmlFor="start-time">Início</Label>
                        <Input id="start-time" type="number" className="w-20" value={startTime} onChange={(e) => setStartTime(parseInt(e.target.value, 10))} min="0" max="23" />
                        <span>h</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Label htmlFor="end-time">Fim</Label>
                        <Input id="end-time" type="number" className="w-20" value={endTime} onChange={(e) => setEndTime(parseInt(e.target.value, 10))} min="1" max="24" />
                        <span>h</span>
                    </div>
                    </div>
                     <p className="text-xs text-muted-foreground">O horário de início se aplica ao primeiro dia e o de fim ao último dia da escala. Todos os dias intermediários terão 24h de oração.</p>
                </div>
                <div className="space-y-2">
                    <Button onClick={handleAdminConfigSubmit} className="w-full">
                        Criar e Disponibilizar Nova Agenda
                    </Button>
                    {allSlotsBooked && activeSchedule && (
                        <Button onClick={() => { handleSendToWhatsApp(); toast({ title: "Escala Enviada!", description: "A escala foi enviada para o WhatsApp."}); }} className="w-full flex items-center gap-2" variant="outline">
                            <WhatsappIcon className="w-5 h-5" />
                            Reenviar Escala para o WhatsApp
                        </Button>
                    )}
                </div>
                </CardContent>
            </Card>
            
            {activeSchedule && showAdminBookings && bookedSlots.length > 0 && (
                <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Agendamentos da Escala Selecionada</CardTitle>
                    <CardDescription>Edite ou remova os agendamentos feitos pelos membros para a escala de {format(new Date(activeSchedule.startDate), 'PPP', { locale: ptBR })}.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead>Horário</TableHead>
                        <TableHead>Nome do Membro</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {bookedSlots.map((slot) => (
                        <TableRow key={slot.time}>
                            <TableCell className="font-medium">{slot.time}</TableCell>
                            <TableCell>{slot.bookedBy}</TableCell>
                            <TableCell className="text-right space-x-2">
                            <Button variant="outline" size="icon" onClick={() => handleEditSlot(slot)}>
                                <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="destructive" size="icon" onClick={() => handleFreeSlot(slot)}>
                                <XCircle className="w-4 h-4" />
                            </Button>
                            </TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                    </Table>
                </CardContent>
                </Card>
            )}
            
            {activeSchedule && showAdminBookings && bookedSlots.length === 0 && (
                 <Card>
                    <CardContent className="pt-6">
                       <p className="text-sm text-muted-foreground text-center">Nenhum horário agendado para esta escala ainda.</p>
                    </CardContent>
                </Card>
            )}

            <Dialog open={isEditingDialogOpen} onOpenChange={setIsEditingDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Editar Agendamento</DialogTitle>
                    <DialogDescription>
                    Alterando o agendamento para o horário das {editingSlot?.time}.
                    </DialogDescription>
                </DialogHeader>
                <Form {...editBookingForm}>
                    <form onSubmit={editBookingForm.handleSubmit(handleEditBookingSubmit)} className="space-y-8 p-4">
                    <FormField
                        control={editBookingForm.control}
                        name="name"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nome do Membro</FormLabel>
                            <FormControl>
                            <Input placeholder="Digite o novo nome" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <DialogFooter>
                        <Button type="submit">Salvar Alterações</Button>
                    </DialogFooter>
                    </form>
                </Form>
                </DialogContent>
            </Dialog>
            <Dialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Acesso Restrito</DialogTitle>
                    <DialogDescription>
                    Por favor, insira a senha de administrador para continuar.
                    </DialogDescription>
                </DialogHeader>
                <Form {...authForm}>
                    <form onSubmit={authForm.handleSubmit(handleAdminAuthSubmit)} className="space-y-8 p-4">
                    <FormField control={authForm.control} name="password"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Senha</FormLabel>
                            <FormControl>
                            <Input type="password" placeholder="Digite a senha" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <DialogFooter>
                        <Button type="submit">Autenticar</Button>
                    </DialogFooter>
                    </form>
                </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
  }

  // Default View for regular users when schedule is defined
  return (
      <div className="space-y-8">
        <Card className="shadow-lg">
        <CardHeader>
            <CardTitle className="flex items-center justify-between">
            <div className='flex items-center gap-2'>
                <Clock className="w-6 h-6" />
                Horários da Torre de Oração
            </div>
            <Button variant="ghost" size="sm" onClick={handleAdminButtonClick}>
                <KeyRound className="w-4 h-4 mr-2" />
                Admin
            </Button>
            </CardTitle>
            <CardDescription>
                Selecione um horário disponível para agendar sua vaga ou clique em um horário já agendado para liberar.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            {!activeSchedule && !isLoading && (
                <Alert variant="destructive" className="bg-red-600 text-white border-red-600 [&>svg]:text-white">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Nenhuma escala definida</AlertTitle>
                    <AlertDescription>
                        Ainda não há uma escala para a Torre de Oração agendada. Por favor, volte mais tarde.
                    </AlertDescription>
                </Alert>
            )}
            
            {activeSchedule && (
              <div className="space-y-6">
                <div className="p-4 border rounded-lg space-y-4">
                    <div className="space-y-2">
                        <Label className="font-semibold">Selecione uma escala para visualizar:</Label>
                        <Select onValueChange={handleScheduleSelect} value={activeSchedule.id}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione uma escala" />
                            </SelectTrigger>
                            <SelectContent>
                                {allSchedules.map(schedule => (
                                    <SelectItem key={schedule.id} value={schedule.id}>
                                        Escala de {format(new Date(schedule.startDate), 'PPP', { locale: ptBR })} à {format(new Date(schedule.endDate), 'PPP', { locale: ptBR })}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Label className="font-semibold">Filtre por um período específico:</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <Label>Data de Início</Label>
                           <Popover>
                                <PopoverTrigger asChild>
                                   <Button
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal", !filterStartDate && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {filterStartDate ? format(filterStartDate, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={filterStartDate}
                                    onSelect={handleFilterStartDateSelect}
                                    initialFocus
                                    locale={ptBR}
                                    disabled={{ before: new Date(activeSchedule.startDate), after: filterEndDate || new Date(activeSchedule.endDate) }}
                                />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label>Data de Fim</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                   <Button
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal", !filterEndDate && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {filterEndDate ? format(filterEndDate, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={filterEndDate}
                                    onSelect={setFilterEndDate}
                                    initialFocus
                                    locale={ptBR}
                                    disabled={{ before: filterStartDate || new Date(activeSchedule.startDate), after: new Date(activeSchedule.endDate) }}
                                />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </div>

                {Object.keys(slotsByDay).length > 0 ? (
                    Object.entries(slotsByDay).map(([day, daySlots]) => (
                    <div key={day}>
                        <h3 className="text-lg font-semibold text-primary mb-3 border-b-2 border-primary/20 pb-2">{day}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {daySlots.map((slot) => (
                            <Button
                            key={slot.time}
                            variant={slot.isBooked ? 'destructive' : 'default'}
                            className={cn('h-20 flex flex-col items-start p-3 transition-all duration-300 ease-in-out transform hover:scale-105 shadow-md font-bold', !slot.isBooked && 'bg-green-600 hover:bg-green-700 text-white')}
                            onClick={() => handleSelectSlot(slot)}
                            >
                            <div className="text-lg">{slot.time.split(' ')[1]}</div>
                            <div className="flex items-center gap-1 text-sm mt-1 font-normal">
                                {slot.isBooked ? (<><User className="w-4 h-4" /><span>{slot.bookedBy}</span></>) : (<><HelpingHand className="w-4 h-4" /><span>Disponível</span></>)}
                            </div>
                            </Button>
                        ))}
                        </div>
                    </div>
                    ))
                ) : (
                    <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Nenhum horário encontrado</AlertTitle>
                        <AlertDescription>
                            Não há horários de oração disponíveis para o período selecionado. Tente alterar as datas do filtro.
                        </AlertDescription>
                    </Alert>
                )}
              </div>
            )}
        </CardContent>
        </Card>
        {activeSchedule && bookedSlots.length > 0 && (
        <Card className="shadow-lg">
            <CardHeader>
            <CardTitle>Escala de Oração Completa</CardTitle>
            <CardDescription>
                Abaixo está a lista de irmãos comprometidos com a oração.
            </CardDescription>
            </CardHeader>
            <CardContent>
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead className="w-[150px]">Horário</TableHead>
                    <TableHead>Nome do Membro</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {bookedSlots.map((slot) => (
                    <TableRow key={slot.time}>
                    <TableCell className="font-medium">{slot.time}</TableCell>
                    <TableCell>{slot.bookedBy}</TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
            </CardContent>
        </Card>
        )}
        <Dialog open={isBookingDialogOpen} onOpenChange={setIsBookingDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Agendar Horário de Oração</DialogTitle>
              <DialogDescription>
                Você está agendando o horário das {selectedSlot?.time}. Por favor, insira seu nome e uma senha de 4 dígitos para confirmar.
              </DialogDescription>
            </DialogHeader>
            <Form {...bookingForm}>
              <form onSubmit={bookingForm.handleSubmit(handleBookingSubmit)} className="space-y-4 p-4">
                <FormField control={bookingForm.control} name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Seu Nome</FormLabel>
                      <FormControl>
                        <Input placeholder="Digite seu nome completo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={bookingForm.control} name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Senha de 4 dígitos</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Crie uma senha" {...field} maxLength={4} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white">Confirmar Agendamento</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        <Dialog open={isDeletingDialogOpen} onOpenChange={setIsDeletingDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle>Liberar Horário</DialogTitle>
                <DialogDescription>
                Para liberar o horário de {selectedSlot?.time}, agendado por {selectedSlot?.bookedBy}, por favor, insira a senha cadastrada.
                </DialogDescription>
            </DialogHeader>
            <Form {...deleteBookingForm}>
                <form onSubmit={deleteBookingForm.handleSubmit(handleDeleteBookingSubmit)} className="space-y-4 p-4">
                <FormField control={deleteBookingForm.control} name="password"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Senha do Agendamento</FormLabel>
                        <FormControl>
                        <Input type="password" placeholder="Digite a senha" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <DialogFooter>
                    <Button type="submit" variant="destructive">Confirmar e Liberar</Button>
                </DialogFooter>
                </form>
            </Form>
            </DialogContent>
        </Dialog>
        <Dialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle>Acesso Restrito</DialogTitle>
                <DialogDescription>
                Por favor, insira a senha de administrador para continuar.
                </DialogDescription>
            </DialogHeader>
            <Form {...authForm}>
                <form onSubmit={authForm.handleSubmit(handleAdminAuthSubmit)} className="space-y-8 p-4">
                <FormField control={authForm.control} name="password"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Senha</FormLabel>
                        <FormControl>
                        <Input type="password" placeholder="Digite a senha" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <DialogFooter>
                    <Button type="submit">Autenticar</Button>
                </DialogFooter>
                </form>
            </Form>
            </DialogContent>
        </Dialog>
    </div>
  );
}
