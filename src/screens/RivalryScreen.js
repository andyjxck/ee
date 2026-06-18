import React, { useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useGame } from '../state/GameState';
import { Ionicons } from '@expo/vector-icons';

const SCREEN_W = Dimensions.get('window').width;

export default function RivalryScreen({ onBack }) {
  const { activeRivalries, claimRivalryReward, songs, week } = useGame();

  const handleClaimReward = (index) => {
    const reward = claimRivalryReward(index);
    if (reward) {
      // Reward already applied in claimRivalryReward
    }
  };

  const playerTotalStreams = songs.reduce((sum, s) => sum + (s.weeklyStreams || 0), 0);

  const tierColors = {
    S: '#FFD700',
    A: '#C0C0C0',
    B: '#CD7F32',
    C: '#8B4513',
    D: '#696969',
  };

  const tierRewards = {
    S: { cash: 50000, fame: 5 },
    A: { cash: 25000, fame: 3 },
    B: { cash: 10000, fame: 2 },
    C: { cash: 5000, fame: 1 },
    D: { cash: 2000, fame: 0.5 },
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Artist Rivalries</Text>
          <Text style={styles.subtitle}>Beat nearby artists to earn rewards</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {activeRivalries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎯</Text>
            <Text style={styles.emptyText}>No active rivalries</Text>
            <Text style={styles.emptySubtext}>Rivalries will appear as you gain fame</Text>
          </View>
        ) : (
          activeRivalries.map((rivalry, index) => {
            const isPending = rivalry.result === 'pending';
            const isWon = rivalry.result === 'won';
            const isLost = rivalry.result === 'lost';
            const canClaim = isWon && !rivalry.rewardClaimed;
            const reward = tierRewards[rivalry.tier] || { cash: 2000, fame: 0.5 };

            return (
              <View key={`${rivalry.artistId}-${rivalry.week}`} style={styles.rivalryCard}>
                <View style={styles.rivalryHeader}>
                  <View style={styles.tierBadge}>
                    <Text style={[styles.tierText, { color: tierColors[rivalry.tier] }]}>
                      {rivalry.tier}
                    </Text>
                  </View>
                  <Text style={styles.artistName}>{rivalry.artistName}</Text>
                  <View style={[
                    styles.statusBadge,
                    isPending && styles.statusPending,
                    isWon && styles.statusWon,
                    isLost && styles.statusLost
                  ]}>
                    <Text style={styles.statusText}>
                      {isPending ? 'IN PROGRESS' : isWon ? 'WON' : 'LOST'}
                    </Text>
                  </View>
                </View>

                <View style={styles.rivalryStats}>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Target Streams</Text>
                    <Text style={styles.statValue}>{rivalry.targetStreams.toLocaleString()}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Your Streams</Text>
                    <Text style={styles.statValue}>{playerTotalStreams.toLocaleString()}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Week</Text>
                    <Text style={styles.statValue}>{rivalry.week}</Text>
                  </View>
                </View>

                {canClaim && (
                  <TouchableOpacity
                    style={styles.claimButton}
                    onPress={() => handleClaimReward(index)}
                  >
                    <Text style={styles.claimButtonText}>Claim Reward</Text>
                    <Text style={styles.claimRewardText}>
                      £{reward.cash.toLocaleString()} +{reward.fame} Fame
                    </Text>
                  </TouchableOpacity>
                )}

                {rivalry.rewardClaimed && (
                  <View style={styles.claimedBadge}>
                    <Text style={styles.claimedText}>Reward Claimed</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    marginRight: 16,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  rivalryCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  rivalryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  tierBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  artistName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPending: {
    backgroundColor: 'rgba(255, 184, 0, 0.2)',
  },
  statusWon: {
    backgroundColor: 'rgba(0, 200, 150, 0.2)',
  },
  statusLost: {
    backgroundColor: 'rgba(255, 59, 59, 0.2)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  rivalryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  claimButton: {
    backgroundColor: '#00c896',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  claimButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  claimRewardText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  claimedBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  claimedText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
});
