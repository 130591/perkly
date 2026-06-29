export type Charge = {
  id: number;               
  amount: bigint;           
  status: 'PENDING';        
  pix_qr_code?: string;      
  expires_at: Date;   
}

export class Psp { 
  async charge(amount: bigint, method: string): Promise<Charge>{
   if (method === 'pix') {
     return {
      id: 123,
      amount: amount,
      status: 'PENDING',
      pix_qr_code: 'kdmomokdmskomsdkmosmdkmosmdk',
      expires_at: new Date()
     }
   }

   throw new Error(`Unsupported charge method: ${method}`)
  }
}
