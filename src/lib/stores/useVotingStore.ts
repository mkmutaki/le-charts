import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { createBaseStore, BaseState } from './useBaseStore';
import { v4 as uuidv4 } from 'uuid';

// Track fetch timestamps to prevent duplicate requests
const lastFetchTimestamps = {
  votes: 0
};
const MIN_FETCH_INTERVAL = 120000; // 120 seconds (2 minutes)

interface VotingState extends BaseState {
  upvoteSong: (songId: string) => Promise<boolean>;
  getUserVotedSong: () => Promise<string | null>;
  resetVotes: () => Promise<void>;
  removeVoteForSong: (songId: string) => Promise<void>;
  votedSongId: string | null;
}

// Function to get or create a device ID
const getDeviceId = (): string => {
  // Check if a device ID already exists in localStorage
  let deviceId = localStorage.getItem('device_id');
  
  // If not, create a new UUID and store it
  if (!deviceId) {
    deviceId = uuidv4();
    localStorage.setItem('device_id', deviceId);
  }
  
  return deviceId;
};

export const useVotingStore = createBaseStore<VotingState>(
  (set, get) => ({
    votedSongId: null,
    
    getUserVotedSong: async () => {
      // If we already have the votedSongId in state, return it
      if (get().votedSongId !== null) {
        return get().votedSongId;
      }
      
      // Check if we need to throttle this request
      const now = Date.now();
      if (now - lastFetchTimestamps.votes < MIN_FETCH_INTERVAL) {
        console.log('Skipping getUserVotedSong - too soon since last fetch');
        return get().votedSongId;
      }
      lastFetchTimestamps.votes = now;
      
      try {
        // Get device ID
        const deviceId = getDeviceId();
        
        if (!deviceId) {
          console.error('Could not determine device ID');
          return null;
        }
        
        // Check if user has already voted for a song - only fetch the song_id field
        // Use maybeSingle() to get at most one record
        const { data, error } = await supabase
          .from('song_votes')
          .select('song_id')
          .eq('device_id', deviceId)
          .maybeSingle();
          
        if (error) throw error;
        
        // If user has voted for a song, return its ID and store in state
        if (data) {
          const songId = data.song_id.toString();
          set({ votedSongId: songId });
          return songId;
        }
        
        // No vote found, update state
        set({ votedSongId: null });
        return null;
      } catch (error) {
        console.error('Error getting user voted song:', error);
        return null;
      }
    },
    
    upvoteSong: async (songId: string) => {
      try {
        console.log('Upvoting song:', songId);
        
        // Get device ID
        const deviceId = getDeviceId();
        
        if (!deviceId) {
          toast.error('Could not identify your device. Voting not possible.');
          return false;
        }
        
        // Check if user already voted for ANY song - first check local state
        const currentVotedSong = get().votedSongId;
        if (currentVotedSong) {
          if (currentVotedSong === songId) {
            toast.info('You already liked this song');
          } else {
            toast.info('You can only vote for one song');
          }
          return false;
        }
        
        // If no local state, check database - only fetch the song_id we need
        const { data: existingVotes, error: checkError } = await supabase
          .from('song_votes')
          .select('song_id')
          .eq('device_id', deviceId)
          .maybeSingle();
          
        if (checkError) throw checkError;
        
        // User already voted for a song - votes are immutable
        if (existingVotes) {
          const currentVotedSongId = existingVotes.song_id.toString();
          set({ votedSongId: currentVotedSongId });
          
          if (currentVotedSongId === songId) {
            toast.info('You already liked this song');
          } else {
            toast.info('You can only vote for one song');
          }
          return false;
        }
        
        // Add the new vote
        const { error } = await supabase
          .from('song_votes')
          .insert({
            song_id: parseInt(songId),
            device_id: deviceId
          });
            
        if (error) throw error;
        
        // Update local state with the new vote
        set({ votedSongId: songId });
        
        toast.success('Vote counted!');
        return true;
      } catch (error) {
        console.error('Error voting for song:', error);
        toast.error('Failed to vote for song');
        return false;
      }
    },
    
    removeVoteForSong: async (songId: string) => {
      try {
        // Verify admin status directly from the database before proceeding
        const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin', {
          id: get().currentUser?.id
        });
        
        if (adminError || !isAdmin) {
          console.error('Error verifying admin status:', adminError);
          toast.error('Only admins can remove votes');
          return;
        }
        
        console.log('Removing votes for song:', songId);
        
        // Remove all votes for the specified song
        const { error } = await supabase
          .from('song_votes')
          .delete()
          .eq('song_id', parseInt(songId));
          
        if (error) throw error;
        
        // If the removed song was the currently voted song, clear the state
        if (get().votedSongId === songId) {
          set({ votedSongId: null });
        }
        
        toast.success('Votes removed for this song');
      } catch (error) {
        console.error('Error removing votes for song:', error);
        toast.error('Failed to remove votes');
      }
    },
    
    resetVotes: async () => {
      try {
        // Verify admin status directly from the database before proceeding
        const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin', {
          id: get().currentUser?.id
        });
        
        if (adminError || !isAdmin) {
          console.error('Error verifying admin status:', adminError);
          toast.error('Only admins can reset votes');
          return;
        }
        
        console.log('Resetting all votes');
        
        // Delete all votes from song_votes table first
        const { error: deleteError } = await supabase
          .from('song_votes')
          .delete()
          .neq('id', 0); // This will match all rows
          
        if (deleteError) throw deleteError;
        
        // Reset vote counts in LeSongs table
        const { error: updateError } = await supabase
          .from('LeSongs')
          .update({ votes: 0, updated_at: new Date().toISOString() })
          .neq('id', 0); // This will match all rows
        
        if (updateError) throw updateError;
        
        // Reset voted song in state
        set({ votedSongId: null });
        
        toast.success('All votes have been reset');
      } catch (error) {
        console.error('Error resetting votes:', error);
        toast.error('Failed to reset votes');
      }
    },
  }),
  'voting-store'
);
