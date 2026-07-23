// index.html (or your main JS file)
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabaseUrl = 'https://your-project.supabase.co' // Replace with your URL
const supabaseKey = 'your-anon-key' // Replace with your ANON key
const supabase = createClient(supabaseUrl, supabaseKey)

// Connect to a room channel (replace 'my-room' with dynamic room name)
const roomName = 'my-room'
const channel = supabase.channel(roomName, {
  config: { 
    broadcast: { self: true },
    presence: { 
      key: 'user_id' // Optional: for presence tracking
    }
  }
})

// Join the channel
channel.subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    console.log(`Connected to room: ${roomName}`)
    
    // Send join message (optional)
    channel.send({
      type: 'broadcast',
      event: 'join',
      payload: { 
        id: 'your-client-id', 
        name: 'Your Name' 
      }
    })
  }
})

// Listen for messages
channel.on('broadcast', { event: '*' }, (payload) => {
  const { event, payload: data } = payload
  
  switch (event) {
    case 'join':
      // Handle new user joining
      console.log(`User joined: ${data.name}`)
      break
      
    case 'text':
    case 'media':
    case 'voice':
      // Handle chat messages
      console.log('Message:', data)
      break
      
    case 'call-offer':
      // Handle WebRTC offer
      console.log('Call offer received:', data)
      // Your WebRTC logic here
      break
      
    case 'call-answer':
    case 'call-ice':
    case 'call-end':
      // Handle targeted signaling
      console.log('Signaling:', data)
      break
  }
})

// Send messages through channel
function sendMessage(type, data) {
  channel.send({
    type: 'broadcast',
    event: type,
    payload: data
  })
}

// Example usage:
// sendMessage('call-offer', { from: 'user1', to: 'user2', sdp: '...' })
