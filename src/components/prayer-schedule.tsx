'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, HelpingHand, User, Lock, Trash2, Loader2, Edit, XCircle, Save, AlertTriangle, ExternalLink, ShieldAlert, Info } from 'lucide-react';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { doc, onSnapshot, setDoc, deleteDoc, getDoc, writeBatch } from "firebase/firestore";


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
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { WhatsappIcon } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { db, firebaseApp } from '@/lib/firebase';

const FIRESTORE_COLLECTION = "torredeoracao";
const WHATSAPP_CONFIG_DOC = "whatsappConfig";
const ADMIN_CONFIG_DOC = "adminConfig";

type Slot = {
  time: string;
  isBooked: boolean;
  bookedBy: string | null;
};

type ScheduleData = {
  slots: Slot[];
  isScheduleDefined: boolean;
  startTime: number;
  endTime: number;
  whatsAppSent?: boolean;
};

const bookingFormSchema = z.object({
  name: z.string().min(2, { message: 'O nome deve ter pelo menos 2 caracteres.' }).max(50),
});

const editBookingFormSchema = z.object({
  name: z.string().min(2, { message: 'O nome deve ter pelo menos 2 caracteres.' }).max(50),
});

const adminAuthSchema = z.object({
  password: z.string().min(1, { message: 'A senha é obrigatória.' }),
});

export function PrayerSchedule() {
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(new Date());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [isScheduleDefined, setIsScheduleDefined] = useState(false);
  const [startTime, setStartTime] = useState(6);
  const [endTime, setEndTime] = useState(18);
  const [whatsAppSent, setWhatsAppSent] = useState(false);
  const [whatsAppNumber, setWhatsAppNumber] = useState('');
  const [whatsAppNumberInput, setWhatsAppNumberInput] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [isEditingDialogOpen, setIsEditingDialogOpen] = useState(false);
  const [firebaseError, setFirebaseError] = useState(false);
  const [adminPassword, setAdminPassword] = useState('123');

  const { toast } = useToast();
  
  const bookingForm = useForm<z.infer<typeof bookingFormSchema>>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: { name: '' },
  });

  const editBookingForm = useForm<z.infer<typeof editBookingFormSchema>>({
    resolver: zodResolver(editBookingFormSchema),
    defaultValues: { name: '' },
  });

  const authForm = useForm<z.infer<typeof adminAuthSchema>>({
    resolver: zodResolver(adminAuthSchema),
    defaultValues: { password: '' },
  });

  const todayDocId = useMemo(() => {
      const date = scheduleDate || new Date();
      return format(date, 'yyyy-MM-dd');
  }, [scheduleDate]);

  useEffect(() => {
    setIsLoading(true);
    setFirebaseError(false);

    const docRef = doc(db, FIRESTORE_COLLECTION, todayDocId);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as ScheduleData;
        setSlots(data.slots || []);
        setIsScheduleDefined(data.isScheduleDefined);
        setStartTime(data.startTime);
        setEndTime(data.endTime);
        setWhatsAppSent(data.whatsAppSent || false);
      } else {
        // Reset to default state if no document exists for this date
        setIsScheduleDefined(false);
        setSlots([]);
        setStartTime(6);
        setEndTime(18);
        setWhatsAppSent(false);
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

    // Fetch WhatsApp config
    const whatsAppDocRef = doc(db, FIRESTORE_COLLECTION, WHATSAPP_CONFIG_DOC);
    getDoc(whatsAppDocRef).then((docSnap) => {
        if(docSnap.exists() && docSnap.data().number) {
            const number = docSnap.data().number;
            setWhatsAppNumber(number);
            setWhatsAppNumberInput(number);
        }
    }).catch(err => console.error("Error fetching whatsapp config", err));

    // Fetch Admin password
    const adminDocRef = doc(db, FIRESTORE_COLLECTION, ADMIN_CONFIG_DOC);
    getDoc(adminDocRef).then((docSnap) => {
        if(docSnap.exists() && docSnap.data().password) {
            setAdminPassword(docSnap.data().password);
        }
    }).catch(err => console.error("Error fetching admin password", err));


    return () => unsubscribe();
  }, [todayDocId, toast]);

  const updateScheduleInFirestore = useCallback(async (dataToUpdate: Partial<ScheduleData>) => {
      const docRef = doc(db, FIRESTORE_COLLECTION, todayDocId);
      try {
        await setDoc(docRef, dataToUpdate, { merge: true });
      } catch (error) {
          console.error("Failed to save state to Firestore", error);
          toast({
              title: "Erro de Salvamento",
              description: "Não foi possível salvar as alterações no banco de dados.",
              variant: "destructive",
          });
      }
  }, [todayDocId, toast]);

  const updateWhatsAppConfigInFirestore = async (newNumber: string) => {
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
      batch.set(adminDocRef, { password: newPassword });
      
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


 const generateTimeSlots = useCallback((start: number, end: number): Slot[] => {
    const newSlots: Slot[] = [];
    if (end <= start) return [];

    for (let i = start; i < end; i++) {
        const startTimeStr = `${String(i).padStart(2, '0')}h`;
        const endTimeStr = `${String(i + 1).padStart(2, '0')}h`;
        const time = `${startTimeStr} - ${endTimeStr}`;

        newSlots.push({
            time: time,
            isBooked: false,
            bookedBy: null,
        });
    }
    return newSlots;
}, []);

  const bookedSlots = useMemo(() => (slots || []).filter((s) => s.isBooked).sort((a, b) => a.time.localeCompare(b.time)), [slots]);
  const allSlotsBooked = useMemo(() => isScheduleDefined && (slots || []).length > 0 && (slots || []).every((s) => s.isBooked), [slots, isScheduleDefined]);

  const handleSendToWhatsApp = useCallback(async () => {
    if (!scheduleDate || bookedSlots.length === 0) return;
    const dateToFormat = new Date(scheduleDate);
    if (isNaN(dateToFormat.getTime())) {
        toast({ title: "Data inválida para envio.", variant: "destructive" });
        return;
    }
    if (!whatsAppNumber) {
        toast({
            title: "Número do WhatsApp não configurado",
            description: "Por favor, configure o número do WhatsApp na área do administrador.",
            variant: "destructive"
        });
        return;
    }
    const scheduleText = `*Escala da Torre de Oração para o dia: ${format(dateToFormat, 'PPP', { locale: ptBR })}*\n\n${bookedSlots
      .map((s) => `*${s.time}*: ${s.bookedBy}`)
      .join('\n')}\n\nObrigado a todos pela participação!`;
    const encodedMessage = encodeURIComponent(scheduleText);
    const whatsappUrl = `https://wa.me/${whatsAppNumber}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    
    const docRef = doc(db, FIRESTORE_COLLECTION, todayDocId);
    await setDoc(docRef, { whatsAppSent: true }, { merge: true });

  }, [scheduleDate, bookedSlots, whatsAppNumber, toast, todayDocId]);

  useEffect(() => {
    if (allSlotsBooked && !whatsAppSent) {
      handleSendToWhatsApp();
    }
  }, [allSlotsBooked, whatsAppSent, handleSendToWhatsApp]);

  const handleSelectSlot = (slot: Slot) => {
    if (!slot.isBooked) {
      setSelectedSlot(slot);
      setIsBookingDialogOpen(true);
      bookingForm.reset();
    }
  };
  
  const handleEditSlot = (slot: Slot) => {
    setEditingSlot(slot);
    editBookingForm.setValue("name", slot.bookedBy || "");
    setIsEditingDialogOpen(true);
  };

  const handleBookingSubmit = async (values: z.infer<typeof bookingFormSchema>) => {
    if (selectedSlot) {
      const updatedSlots = slots.map((s) =>
        s.time === selectedSlot.time ? { ...s, isBooked: true, bookedBy: values.name } : s
      );
      
      await updateScheduleInFirestore({ slots: updatedSlots });
      
      setIsBookingDialogOpen(false);
      setSelectedSlot(null);
      toast({
        title: 'Horário Agendado!',
        description: `Obrigado, ${values.name}. Sua hora de oração foi confirmada.`,
        className: 'bg-green-600 text-white',
      });
    }
  };
  
  const handleEditBookingSubmit = async (values: z.infer<typeof editBookingFormSchema>) => {
    if (editingSlot) {
      const updatedSlots = slots.map((s) =>
        s.time === editingSlot.time ? { ...s, isBooked: true, bookedBy: values.name } : s
      );
      
      await updateScheduleInFirestore({ slots: updatedSlots });

      toast({
        title: 'Agendamento Atualizado!',
        description: `O horário de ${editingSlot.time} foi atualizado para ${values.name}.`,
      });
      setIsEditingDialogOpen(false);
      setEditingSlot(null);
    }
  };
  
  const handleFreeSlot = async (slotToFree: Slot) => {
    const updatedSlots = slots.map((s) =>
      s.time === slotToFree.time ? { ...s, isBooked: false, bookedBy: null } : s
    );
     await updateScheduleInFirestore({ slots: updatedSlots });
     toast({
       title: 'Horário Liberado!',
       description: `O horário ${slotToFree.time} está disponível novamente.`,
     });
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
    const currentScheduleDate = scheduleDate ? new Date(scheduleDate) : new Date();
    if (isNaN(currentScheduleDate.getTime())) {
      toast({ title: "Data inválida.", description: "Por favor, selecione uma data válida.", variant: "destructive" });
      return;
    }
    if (startTime >= endTime) {
      toast({ title: "Intervalo de horário inválido.", description: "O horário de início deve ser menor que o de fim.", variant: "destructive" });
      return;
    }
    
    const newSlots = generateTimeSlots(startTime, endTime);
    
    const newScheduleData: ScheduleData = {
      slots: newSlots,
      startTime,
      endTime,
      isScheduleDefined: true,
      whatsAppSent: false,
    };
    
    const docRef = doc(db, FIRESTORE_COLLECTION, todayDocId);
    await setDoc(docRef, newScheduleData);

    toast({
      title: "Agenda Definida!",
      description: `A escala para ${format(currentScheduleDate, 'PPP', { locale: ptBR })} das ${startTime}h às ${endTime}h está disponível.`
    });
  };

  const handleDeleteSchedule = useCallback(async () => {
    const docRef = doc(db, FIRESTORE_COLLECTION, todayDocId);
    try {
        await deleteDoc(docRef);
        setIsDeleteDialogOpen(false);
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
  }, [todayDocId, toast]);

  const handleAdminButtonClick = () => {
    authForm.reset();
    setIsAuthDialogOpen(true);
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
                    <ShieldAlert className="h-4 w-4" />
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
                <CardTitle>Configuração do WhatsApp e Senha</CardTitle>
                <CardDescription>
                    Insira o número de WhatsApp para onde a escala será enviada. Use o formato internacional sem `+' ou espaços (ex: 5511999998888). Ao salvar, a senha do admin será trocada para 'ibrb' + os 4 últimos dígitos do número.
                </CardDescription>
                </CardHeader>
                <CardContent>
                <div className="flex items-center gap-2">
                    <WhatsappIcon className="w-5 h-5" />
                    <Input
                    id="whatsapp-number"
                    type="tel"
                    placeholder="Ex: 5511999998888"
                    value={whatsAppNumberInput}
                    onChange={(e) => setWhatsAppNumberInput(e.target.value)}
                    />
                    <Button size="icon" onClick={() => updateWhatsAppConfigInFirestore(whatsAppNumberInput)}>
                    <Save className="w-5 h-5" />
                    </Button>
                </div>
                </CardContent>
            </Card>
            <Card className="shadow-lg">
                <CardHeader>
                <CardTitle>Configurar Escala de Oração</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label>1. Escolha o Dia da Oração</Label>
                    <Popover>
                    <PopoverTrigger asChild>
                        <Button
                        variant={'outline'}
                        className={cn('w-full sm:w-[280px] justify-start text-left font-normal',!scheduleDate && 'text-muted-foreground')}
                        >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {scheduleDate ? format(new Date(scheduleDate), 'PPP', { locale: ptBR }) : <span>Escolha uma data</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar
                        mode="single"
                        selected={scheduleDate}
                        onSelect={(date) => setScheduleDate(date || undefined)}
                        initialFocus
                        locale={ptBR}
                        />
                    </PopoverContent>
                    </Popover>
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
                </div>
                <div className="space-y-2">
                    <Label>3. Ações da Escala</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button onClick={handleAdminConfigSubmit}>
                        {isScheduleDefined ? "Atualizar Agenda" : "Salvar e Disponibilizar Agenda"}
                    </Button>
                    {isScheduleDefined && (
                        <Button onClick={() => setIsAdminMode(false)} variant="outline" className="bg-green-600 text-white hover:bg-accent hover:text-accent-foreground">
                            Voltar para Escala
                        </Button>
                    )}
                    {allSlotsBooked && (
                        <Button onClick={() => { handleSendToWhatsApp(); toast({ title: "Escala Enviada!", description: "A escala foi enviada para o WhatsApp."}); }} className="w-full flex items-center gap-2" variant="outline">
                            <WhatsappIcon className="w-5 h-5" />
                            Reenviar Escala para o WhatsApp
                        </Button>
                    )}
                    {isScheduleDefined && (
                        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="w-full flex items-center gap-2">
                            <Trash2 className="w-5 h-5" />
                            Excluir Escala
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Esta ação não pode ser desfeita. Isso irá apagar permanentemente a escala atual e todos os agendamentos feitos.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteSchedule}>Sim, Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                        </AlertDialog>
                    )}
                    </div>
                </div>
                </CardContent>
            </Card>
            {isScheduleDefined && bookedSlots.length > 0 && (
                <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Gerenciar Agendamentos</CardTitle>
                    <CardDescription>Edite ou remova os agendamentos feitos pelos membros.</CardDescription>
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
                Horários para {scheduleDate ? format(new Date(scheduleDate), 'PPP', { locale: ptBR }) : ''}
            </div>
            <Button variant="ghost" size="sm" onClick={handleAdminButtonClick}>
                Admin
            </Button>
            </CardTitle>
            <CardDescription>
             Selecione um dia e um horário para participar da nossa Torre de oração. Clique em um horário disponível para agendar sua vaga na escala de oração.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <Popover>
              <PopoverTrigger asChild>
                  <Button
                  variant={'outline'}
                  className={cn('w-full sm:w-[280px] justify-start text-left font-normal',!scheduleDate && 'text-muted-foreground')}
                  >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {scheduleDate ? format(new Date(scheduleDate), 'PPP', { locale: ptBR }) : <span>Escolha uma data</span>}
                  </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                  <Calendar
                  mode="single"
                  selected={scheduleDate}
                  onSelect={(date) => setScheduleDate(date || undefined)}
                  initialFocus
                  locale={ptBR}
                  />
              </PopoverContent>
            </Popover>

            {!isScheduleDefined && (
                 <div className="space-y-4 text-center">
                    <Alert variant="destructive" className="shadow-lg bg-red-600 text-white">
                        <AlertTriangle className="h-4 w-4 text-white" />
                        <AlertTitle className="text-white">Nenhuma escala definida</AlertTitle>
                        <AlertDescription className="text-white">
                            A escala para a Torre de Oração no dia selecionado ainda não foi definida. Por favor, volte mais tarde ou selecione outra data.
                        </AlertDescription>
                    </Alert>
                </div>
            )}
            
            {isScheduleDefined && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {(slots || []).map((slot) => (
                    <Button
                    key={slot.time}
                    variant={slot.isBooked ? 'destructive' : 'default'}
                    className={cn('h-20 flex flex-col items-start p-3 transition-all duration-300 ease-in-out transform hover:scale-105 shadow-md font-bold', !slot.isBooked && 'bg-green-600 hover:bg-green-700 text-white')}
                    onClick={() => handleSelectSlot(slot)}
                    disabled={slot.isBooked}
                    >
                    <div className="text-lg">{slot.time}</div>
                    <div className="flex items-center gap-1 text-sm mt-1 font-normal">
                        {slot.isBooked ? (<><User className="w-4 h-4" /><span>{slot.bookedBy}</span></>) : (<><HelpingHand className="w-4 h-4" /><span>Disponível</span></>)}
                    </div>
                    </Button>
                ))}
                </div>
            )}
        </CardContent>
        </Card>
        {isScheduleDefined && bookedSlots.length > 0 && (
        <Card className="shadow-lg">
            <CardHeader>
            <CardTitle>Escala de Oração do Dia</CardTitle>
            <CardDescription>
                Abaixo está a lista de irmãos comprometidos com a oração para o dia selecionado.
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
                Você está agendando o horário das {selectedSlot?.time}. Por favor, insira seu nome para confirmar.
              </DialogDescription>
            </DialogHeader>
            <Form {...bookingForm}>
              <form onSubmit={bookingForm.handleSubmit(handleBookingSubmit)} className="space-y-8 p-4">
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
                <DialogFooter>
                  <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white">Confirmar Agendamento</Button>
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
