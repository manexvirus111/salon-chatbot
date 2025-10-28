import React, { useState, useEffect, useRef } from 'react';
import { Message, Appointment } from './types';
import { startChat, sendMessageToBot, ChatSession } from './services/geminiService';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { OwnerDashboard } from './components/OwnerDashboard';

// Mock database of appointments, now used as initial state
const INITIAL_APPOINTMENTS: Appointment[] = [
  { id: 1, customer_name: "Jane Doe", service: "Deluxe Haircut", stylist: "Alex", date: "2024-08-15", time: "10:00 AM" },
  { id: 2, customer_name: "John Smith", service: "Manicure", stylist: "Maria", date: "2024-08-16", time: "2:00 PM" },
  { id: 3, customer_name: "Jane Doe", service: "Color & Highlights", stylist: "Chris", date: "2024-08-22", time: "1:30 PM" },
  { id: 4, customer_name: "Emily White", service: "Spa Pedicure", stylist: "Maria", date: "2024-08-16", time: "3:00 PM" },
  { id: 5, customer_name: "Michael Brown", service: "Men's Classic Cut", stylist: "Alex", date: "2024-08-17", time: "11:00 AM" },
];


const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOwnerViewVisible, setIsOwnerViewVisible] = useState<boolean>(false);
  const [appointments, setAppointments] = useState<Appointment[]>(INITIAL_APPOINTMENTS);
  const chatSessionIdRef = useRef<ChatSession>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Tool implementations that modify the app's state
  const getAppointments = (customer_name: string): Appointment[] => {
    return appointments.filter(
        (appt) => appt.customer_name.toLowerCase() === customer_name.toLowerCase()
    );
  };
  
  const rescheduleAppointment = (customer_name: string, original_date: string, new_date: string, new_time: string): { success: boolean, message: string } => {
    let success = false;
    const targetAppointment = appointments.find(appt => appt.customer_name.toLowerCase() === customer_name.toLowerCase() && appt.date === original_date);

    if (targetAppointment) {
        setAppointments(prev => prev.map(appt => 
            (appt.id === targetAppointment.id) ? { ...appt, date: new_date, time: new_time } : appt
        ));
        success = true;
    }
    
    return { success, message: success ? `Successfully rescheduled appointment for ${customer_name} to ${new_date} at ${new_time}.` : `Could not find an appointment for ${customer_name} on ${original_date}.` };
  };

  const cancelAppointment = (customer_name: string, appointment_date: string): { success: boolean, message: string } => {
    let success = false;
    const targetAppointment = appointments.find(appt => appt.customer_name.toLowerCase() === customer_name.toLowerCase() && appt.date === appointment_date);

    if (targetAppointment) {
        setAppointments(prev => prev.filter(appt => appt.id !== targetAppointment.id));
        success = true;
    }
    
    return { success, message: success ? `Successfully canceled appointment for ${customer_name} on ${appointment_date}.` : `Could not find an appointment for ${customer_name} on ${appointment_date}.` };
  };


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const initializeChat = async () => {
      try {
        const { response, sessionId } = await startChat();
        chatSessionIdRef.current = sessionId;

        if (response.text) {
          setMessages([
            {
              id: crypto.randomUUID(),
              text: response.text,
              sender: 'bot',
            },
          ]);
        }
      } catch (error) {
        console.error("Initialization failed:", error);
        setMessages([
            {
                id: crypto.randomUUID(),
                text: "Failed to initialize the chat assistant. Please check the API key and refresh.",
                sender: 'bot',
            }
        ]);
      } finally {
        setIsLoading(false);
      }
    };
    initializeChat();
  }, []);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !chatSessionIdRef.current) return;

    const sessionId = chatSessionIdRef.current;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      text,
      sender: 'user',
    };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setIsLoading(true);
    
    try {
        let response = await sendMessageToBot(sessionId, text);

        // Loop to handle potential function calls
        while (response.functionCalls && response.functionCalls.length > 0) {
            const functionCalls = response.functionCalls;
            const call = functionCalls[0];
            let result: object;
            let toolName: string;
            
            if (call.name === 'get_appointments') {
                toolName = 'get_appointments';
                // FIX: Cast argument from 'unknown' to 'string'
                result = getAppointments(call.args.customer_name as string);
            } else if (call.name === 'reschedule_appointment') {
                toolName = 'reschedule_appointment';
                const { customer_name, original_date, new_date, new_time } = call.args;
                // FIX: Cast arguments from 'unknown' to 'string'
                result = rescheduleAppointment(customer_name as string, original_date as string, new_date as string, new_time as string);
            } else if (call.name === 'cancel_appointment') {
                toolName = 'cancel_appointment';
                const { customer_name, appointment_date } = call.args;
                // FIX: Cast arguments from 'unknown' to 'string'
                result = cancelAppointment(customer_name as string, appointment_date as string);
            } else {
                break; // Unknown function call
            }

            // Send the function result back to the model
            response = await sendMessageToBot(sessionId, JSON.stringify({
                functionResponse: { name: toolName, response: result }
            }));
        }

        if (response.text) {
            const botMessage: Message = {
                id: crypto.randomUUID(),
                text: response.text,
                sender: 'bot',
            };
            setMessages((prevMessages) => [...prevMessages, botMessage]);
        }

    } catch (error) {
        console.error("Error during message send:", error);
        const errorMessage: Message = {
            id: crypto.randomUUID(),
            text: "Sorry, I encountered an error. Please try again.",
            sender: 'bot',
        };
        setMessages((prevMessages) => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-col h-screen max-w-3xl mx-auto bg-transparent shadow-2xl rounded-lg overflow-hidden">
        <header className="flex items-center justify-between p-3 bg-[#005E54] text-white shadow-md">
          <div className="flex items-center">
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mr-3">
                  <span className="text-2xl font-bold text-teal-700">GS</span>
              </div>
              <div>
                  <h1 className="text-xl font-bold">Grandeur Salon</h1>
                  <p className="text-sm text-gray-200">AI Assistant</p>
              </div>
          </div>
          <div className="flex items-center gap-4">
              <div className="flex items-center text-sm">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                Online
              </div>
              <button 
                onClick={() => setIsOwnerViewVisible(true)} 
                className="p-2 rounded-full hover:bg-black/20 transition-colors"
                aria-label="Owner Dashboard"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
              </button>
          </div>
        </header>
        
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-transparent">
          <div className="flex flex-col gap-4">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isLoading && messages.length > 0 && (
               <div className="flex items-end gap-2 self-start fade-in">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gray-500">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10 9a3 3 0 100-6 3 3 0 000 6z" />
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a4 4 0 00-3.464 6.012A5.966 5.966 0 0010 16a5.966 5.966 0 002.464-1.988A4 4 0 0011 5z" clipRule="evenodd" />
                      </svg>
                  </div>
                  <div className="rounded-lg p-3 shadow-md bg-white dark:bg-gray-700">
                      <div className="flex items-center justify-center gap-1">
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-0"></span>
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></span>
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-300"></span>
                      </div>
                  </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>

        <footer className="bg-transparent">
          <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
        </footer>
      </div>
      {isOwnerViewVisible && (
        <OwnerDashboard 
          appointments={appointments}
          onClose={() => setIsOwnerViewVisible(false)}
        />
      )}
    </>
  );
};

export default App;