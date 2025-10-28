import { Chat } from "@google/genai";

export type Sender = 'user' | 'bot';

export interface Message {
  id: string;
  text: string;
  sender: Sender;
}

export interface Appointment {
  id: number;
  customer_name: string;
  service: string;
  stylist: string;
  date: string;
  time: string;
}

export type ChatSession = Chat;