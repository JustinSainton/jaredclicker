// Fund Clicker Live Activities
// Shows battle progress on Lock Screen and Dynamic Island
// Requires iOS 16.1+ and ActivityKit framework
//
// This file is injected into the Xcode project by the Expo config plugin.
// It defines two Live Activity types:
// 1. BattleActivity — during active 1v1 or group battles
// 2. FundraiserActivity — showing fundraiser progress

import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - Battle Live Activity

struct BattleAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var player1Score: Int
        var player2Score: Int
        var status: String // "active", "finished"
        var winner: String
    }

    var gameType: String
    var player1Name: String
    var player2Name: String
    var wagerCoins: Int
}

struct BattleLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BattleAttributes.self) { context in
            // Lock Screen banner
            HStack {
                VStack(alignment: .leading) {
                    Text(context.attributes.gameType)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Text("\(context.attributes.player1Name) vs \(context.attributes.player2Name)")
                        .font(.headline)
                        .bold()
                }
                Spacer()
                HStack(spacing: 16) {
                    VStack {
                        Text("\(context.state.player1Score)")
                            .font(.title2)
                            .bold()
                            .foregroundColor(.blue)
                        Text(context.attributes.player1Name)
                            .font(.caption2)
                    }
                    Text("vs")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    VStack {
                        Text("\(context.state.player2Score)")
                            .font(.title2)
                            .bold()
                            .foregroundColor(.red)
                        Text(context.attributes.player2Name)
                            .font(.caption2)
                    }
                }
            }
            .padding()
            .activityBackgroundTint(.black.opacity(0.8))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading) {
                        Text(context.attributes.player1Name)
                            .font(.caption)
                        Text("\(context.state.player1Score)")
                            .font(.title2)
                            .bold()
                            .foregroundColor(.blue)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing) {
                        Text(context.attributes.player2Name)
                            .font(.caption)
                        Text("\(context.state.player2Score)")
                            .font(.title2)
                            .bold()
                            .foregroundColor(.red)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text("⚔️")
                        .font(.title)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("\(context.attributes.wagerCoins) coins on the line")
                        .font(.caption2)
                        .foregroundColor(.yellow)
                }
            } compactLeading: {
                Text("⚔️")
            } compactTrailing: {
                Text("\(context.state.player1Score)-\(context.state.player2Score)")
                    .font(.caption2)
                    .bold()
            } minimal: {
                Text("⚔️")
            }
        }
    }
}

// MARK: - Fundraiser Live Activity

struct FundraiserAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var totalRaisedCents: Int
        var playerRank: Int
        var playerCount: Int
    }

    var orgName: String
}

struct FundraiserLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FundraiserAttributes.self) { context in
            HStack {
                VStack(alignment: .leading) {
                    Text(context.attributes.orgName)
                        .font(.headline)
                        .bold()
                    Text("$\(String(format: "%.2f", Double(context.state.totalRaisedCents) / 100.0)) raised")
                        .font(.subheadline)
                        .foregroundColor(.green)
                }
                Spacer()
                VStack(alignment: .trailing) {
                    Text("#\(context.state.playerRank)")
                        .font(.title2)
                        .bold()
                        .foregroundColor(.yellow)
                    Text("\(context.state.playerCount) players")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .padding()
            .activityBackgroundTint(.black.opacity(0.8))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("$\(String(format: "%.2f", Double(context.state.totalRaisedCents) / 100.0))")
                        .font(.title3)
                        .bold()
                        .foregroundColor(.green)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("#\(context.state.playerRank)")
                        .font(.title3)
                        .bold()
                        .foregroundColor(.yellow)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.attributes.orgName)
                        .font(.caption)
                }
            } compactLeading: {
                Text("💰")
            } compactTrailing: {
                Text("$\(context.state.totalRaisedCents / 100)")
                    .font(.caption2)
                    .bold()
                    .foregroundColor(.green)
            } minimal: {
                Text("💰")
            }
        }
    }
}

// MARK: - Widget Bundle

@main
struct FundClickerWidgetBundle: WidgetBundle {
    var body: some Widget {
        BattleLiveActivity()
        FundraiserLiveActivity()
    }
}
