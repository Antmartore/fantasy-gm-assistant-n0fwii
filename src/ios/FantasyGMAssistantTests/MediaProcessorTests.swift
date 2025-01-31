//
// MediaProcessorTests.swift
// FantasyGMAssistantTests
//
// Comprehensive test suite for MediaProcessor functionality
// Version: 1.0.0
//

import XCTest // iOS 14.0+
import AVFoundation // iOS 14.0+
import FFmpegKit // v5.1
@testable import FantasyGMAssistant

class MediaProcessorTests: XCTestCase {
    
    // MARK: - Properties
    private var mediaProcessor: MediaProcessor!
    private var testBundle: Bundle!
    private var testExpectation: XCTestExpectation!
    
    // MARK: - Test Data
    private let TEST_TRADE_DETAILS: [String: Any] = [
        "players": [
            ["name": "Patrick Mahomes", "team": "KC", "position": "QB", "stats": ["passing_yards": 4839]],
            ["name": "Justin Jefferson", "team": "MIN", "position": "WR", "stats": ["receiving_yards": 1809]]
        ],
        "analysis": "High-value trade with balanced risk profile",
        "risk_score": 0.75
    ]
    
    private let TEST_VOICE_TEXT = """
        Trade Analysis: Patrick Mahomes for Justin Jefferson.
        This high-value trade shows balanced risk with strong upside potential.
        Both players have demonstrated elite performance in their positions.
        """
    
    private let TEST_MEDIA_OPTIONS = MediaProcessingOptions(
        quality: "high",
        format: "mp4",
        optimization: "quality",
        maxDuration: 180,
        maxFileSize: 50_000_000
    )
    
    // MARK: - Setup and Teardown
    override func setUp() {
        super.setUp()
        mediaProcessor = MediaProcessor()
        testBundle = Bundle(for: type(of: self))
        
        // Setup test media files
        let testMediaPath = testBundle.path(forResource: "test_video", ofType: "mp4")!
        try? FileManager.default.copyItem(
            atPath: testMediaPath,
            toPath: FileManager.default.temporaryDirectory.appendingPathComponent("test_video.mp4").path
        )
    }
    
    override func tearDown() {
        // Cleanup test files
        try? FileManager.default.removeItem(
            at: FileManager.default.temporaryDirectory.appendingPathComponent("test_video.mp4")
        )
        mediaProcessor = nil
        testBundle = nil
        super.tearDown()
    }
    
    // MARK: - Video Generation Tests
    func testTradeAnalysisVideoGeneration() async throws {
        // Setup expectation
        testExpectation = expectation(description: "Video generation completed")
        
        // Test progress tracking
        var progressUpdates: [Double] = []
        let progressHandler: (Double) -> Void = { progress in
            progressUpdates.append(progress)
        }
        
        // Generate video
        let result = await mediaProcessor.generateTradeAnalysisVideo(
            tradeDetails: TEST_TRADE_DETAILS,
            progressHandler: progressHandler
        )
        
        // Verify result
        switch result {
        case .success(let videoURL):
            // Validate video file
            let asset = AVAsset(url: videoURL)
            let duration = try await asset.load(.duration)
            
            XCTAssertTrue(FileManager.default.fileExists(atPath: videoURL.path))
            XCTAssertLessThanOrEqual(duration.seconds, 180.0)
            XCTAssertGreaterThan(duration.seconds, 0.0)
            
            // Verify progress tracking
            XCTAssertGreaterThan(progressUpdates.count, 0)
            XCTAssertEqual(progressUpdates.last, 1.0)
            
            testExpectation.fulfill()
            
        case .failure(let error):
            XCTFail("Video generation failed with error: \(error)")
        }
        
        await waitForExpectations(timeout: 30.0)
    }
    
    // MARK: - Voice Generation Tests
    func testVoiceOverGeneration() async throws {
        testExpectation = expectation(description: "Voice generation completed")
        
        let result = await mediaProcessor.generateVoiceOver(
            text: TEST_VOICE_TEXT,
            quality: .premium
        )
        
        switch result {
        case .success(let audioURL):
            // Validate audio file
            let asset = AVAsset(url: audioURL)
            let duration = try await asset.load(.duration)
            
            XCTAssertTrue(FileManager.default.fileExists(atPath: audioURL.path))
            XCTAssertGreaterThan(duration.seconds, 0.0)
            
            // Verify audio format
            let format = try await asset.load(.tracks)
            XCTAssertEqual(format.first?.mediaType, .audio)
            
            testExpectation.fulfill()
            
        case .failure(let error):
            XCTFail("Voice generation failed with error: \(error)")
        }
        
        await waitForExpectations(timeout: 15.0)
    }
    
    // MARK: - Media Processing Tests
    func testMediaProcessing() async throws {
        testExpectation = expectation(description: "Media processing completed")
        
        let inputURL = FileManager.default.temporaryDirectory.appendingPathComponent("test_video.mp4")
        
        var progressUpdates: [Double] = []
        let progressHandler: (Double) -> Void = { progress in
            progressUpdates.append(progress)
        }
        
        let result = await mediaProcessor.processMediaFile(
            fileURL: inputURL,
            options: TEST_MEDIA_OPTIONS,
            progressHandler: progressHandler
        )
        
        switch result {
        case .success(let outputURL):
            // Validate processed file
            let asset = AVAsset(url: outputURL)
            let duration = try await asset.load(.duration)
            let tracks = try await asset.load(.tracks)
            
            XCTAssertTrue(FileManager.default.fileExists(atPath: outputURL.path))
            XCTAssertLessThanOrEqual(duration.seconds, TEST_MEDIA_OPTIONS.maxDuration)
            XCTAssertGreaterThan(tracks.count, 0)
            
            // Verify progress tracking
            XCTAssertGreaterThan(progressUpdates.count, 0)
            XCTAssertEqual(progressUpdates.last, 1.0)
            
            testExpectation.fulfill()
            
        case .failure(let error):
            XCTFail("Media processing failed with error: \(error)")
        }
        
        await waitForExpectations(timeout: 20.0)
    }
    
    // MARK: - Resource Management Tests
    func testResourceManagement() async throws {
        testExpectation = expectation(description: "Resource management test completed")
        
        // Simulate memory pressure
        NotificationCenter.default.post(
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
        
        // Verify cleanup
        let tmpContents = try FileManager.default.contentsOfDirectory(
            at: FileManager.default.temporaryDirectory,
            includingPropertiesForKeys: nil
        )
        
        let mediaFiles = tmpContents.filter { 
            $0.pathExtension == "mp4" || $0.pathExtension == "mp3"
        }
        
        XCTAssertEqual(mediaFiles.count, 0, "Temporary media files should be cleaned up")
        
        // Test concurrent processing
        async let video1 = mediaProcessor.generateTradeAnalysisVideo(tradeDetails: TEST_TRADE_DETAILS)
        async let video2 = mediaProcessor.generateTradeAnalysisVideo(tradeDetails: TEST_TRADE_DETAILS)
        
        let results = await [video1, video2]
        
        // Verify resource management under load
        for result in results {
            switch result {
            case .success:
                continue
            case .failure(let error):
                if error != .resourceUnavailable {
                    XCTFail("Unexpected error during concurrent processing: \(error)")
                }
            }
        }
        
        testExpectation.fulfill()
        await waitForExpectations(timeout: 45.0)
    }
}